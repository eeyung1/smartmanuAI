import {
  sourceDueSQL,
  effectiveSourceDueSQL,
  nextSourceDueSQL,
} from "./schedule-policy";
import { sourceJobCounts } from "./source-counts";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError, requireAdmin } from "../catalogue/service";
import {
  RetrievalError,
  retrieveSourceResponse,
  safeValidators,
  type SourceValidators,
  type SourceResponse,
} from "./retrieval";
const policySchema = z
  .object({
    sourceId: z.uuid(),
    enabled: z.boolean(),
    permissionNote: z.string().trim().min(10).max(1000),
    cadenceHours: z.number().int().min(6).max(168).optional(),
    requestDelaySeconds: z.number().int().min(0).max(3600).optional(),
    scheduleMode: z.enum(["fixed", "deadline_aware"]).optional(),
  })
  .strict();
export async function collectionPolicy(
  sql: SQL,
  actor: string,
  input: unknown,
) {
  await requireAdmin(sql, actor);
  const v = policySchema.parse(input);
  await sql.transaction(async (tx) => {
    const source = (
      await tx.query("SELECT * FROM sources WHERE id=$1 FOR NO KEY UPDATE", [
        v.sourceId,
      ])
    ).rows[0];
    if (!source) throw new CatalogueError(404, "Source not found.");
    if (
      v.enabled &&
      (source.synthetic ||
        new URL(String(source.url)).hostname.endsWith(".test"))
    )
      throw new CatalogueError(
        400,
        "Synthetic sources cannot be collected live.",
      );
    await tx.query(
      "INSERT INTO source_collection_policies(source_id,enabled,permission_note,actor_id,cadence_hours,request_delay_seconds,schedule_mode) VALUES($1,$2,$3,$4,COALESCE($5,24),COALESCE($6,0),COALESCE($7,'fixed')) ON CONFLICT(source_id) DO UPDATE SET enabled=$2,permission_note=$3,actor_id=$4,cadence_hours=COALESCE($5,source_collection_policies.cadence_hours),request_delay_seconds=COALESCE($6,source_collection_policies.request_delay_seconds),schedule_mode=COALESCE($7,source_collection_policies.schedule_mode),updated_at=NOW()",
      [
        v.sourceId,
        v.enabled,
        v.permissionNote,
        actor,
        v.cadenceHours ?? null,
        v.requestDelaySeconds ?? null,
        v.scheduleMode ?? null,
      ],
    );
    if (v.enabled)
      await tx.query("DELETE FROM source_retry_after WHERE source_id=$1", [
        v.sourceId,
      ]);
    if (!v.enabled)
      await tx.query(
        "UPDATE research_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE source_id=$1 AND state IN ('queued','running')",
        [v.sourceId],
      );
  });
  return { saved: true };
}
export async function scheduleSources(sql: SQL) {
  return sql.transaction(async (tx) => {
    const due = (
      await tx.query(
        `SELECT p.source_id FROM source_collection_policies p LEFT JOIN source_retry_after r ON r.source_id=p.source_id WHERE p.enabled AND ${sourceDueSQL} AND NOT COALESCE(r.requires_review,false) AND (r.retry_after_at IS NULL OR r.retry_after_at<=NOW()) ORDER BY ${effectiveSourceDueSQL},p.source_id LIMIT 25 FOR UPDATE OF p SKIP LOCKED`,
      )
    ).rows;
    for (const row of due) {
      await tx.query(
        "INSERT INTO research_jobs(id,source_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [randomUUID(), row.source_id],
      );
      await tx.query(
        `UPDATE source_collection_policies p SET next_due_at=${nextSourceDueSQL},last_scheduled_at=NOW() WHERE p.source_id=$1`,
        [row.source_id],
      );
    }
    return due.length;
  });
}
export async function claimCollection(sql: SQL) {
  // Complete unrelated exhausted-job cleanup before taking any policy locks.
  await sql.query(
    "UPDATE research_jobs SET state='failed',error_code='attempts_exhausted',lease_token=NULL,lease_until=NULL WHERE state='running' AND lease_until<NOW() AND attempts>=3",
  );
  return sql.transaction(async (tx) => {
    const row = (
      await tx.query(
        "SELECT j.id,j.source_id,s.url,s.collection_host FROM research_jobs j JOIN sources s ON s.id=j.source_id JOIN source_collection_policies p ON p.source_id=s.id LEFT JOIN source_retry_after r ON r.source_id=s.id LEFT JOIN collection_host_locks h ON h.hostname=s.collection_host WHERE (h.last_claim_at IS NULL OR h.last_claim_at+h.request_delay_seconds*INTERVAL '1 second'<=NOW()) AND p.enabled AND NOT COALESCE(r.requires_review,false) AND (r.retry_after_at IS NULL OR r.retry_after_at<=NOW()) AND (p.last_request_at IS NULL OR p.last_request_at+p.request_delay_seconds*INTERVAL '1 second'<=NOW()) AND j.attempts<3 AND ((j.state='queued' AND j.available_at<=NOW()) OR (j.state='running' AND j.lease_until<NOW())) AND NOT EXISTS(SELECT 1 FROM sources busy_source JOIN research_jobs busy_job ON busy_job.source_id=busy_source.id WHERE busy_source.collection_host=s.collection_host AND busy_job.state='running' AND busy_job.lease_until>NOW()) ORDER BY j.created_at,j.id LIMIT 1",
      )
    ).rows[0];
    if (!row) return null;
    // Host mutex first, then policy and job. Existing running leases also block the host.
    await tx.query(
      "INSERT INTO collection_host_locks(hostname) VALUES($1) ON CONFLICT DO NOTHING",
      [row.collection_host],
    );
    const host = (
      await tx.query(
        "SELECT hostname FROM collection_host_locks WHERE hostname=$1 AND (last_claim_at IS NULL OR last_claim_at+request_delay_seconds*INTERVAL '1 second'<=NOW()) FOR UPDATE SKIP LOCKED",
        [row.collection_host],
      )
    ).rows[0];
    if (!host) return null;
    if (
      (
        await tx.query(
          "SELECT j.id FROM research_jobs j JOIN sources s ON s.id=j.source_id WHERE s.collection_host=$1 AND j.state='running' AND j.lease_until>NOW() LIMIT 1",
          [row.collection_host],
        )
      ).rows.length
    )
      return null;
    const policy = (
      await tx.query(
        "SELECT p.source_id FROM source_collection_policies p LEFT JOIN source_retry_after r ON r.source_id=p.source_id WHERE p.source_id=$1 AND p.enabled AND NOT COALESCE(r.requires_review,false) AND (r.retry_after_at IS NULL OR r.retry_after_at<=NOW()) AND (p.last_request_at IS NULL OR p.last_request_at+p.request_delay_seconds*INTERVAL '1 second'<=NOW()) FOR UPDATE OF p SKIP LOCKED",
        [row.source_id],
      )
    ).rows[0];
    if (!policy) return null;

    const current = (
      await tx.query(
        "SELECT id FROM research_jobs WHERE id=$1 AND source_id=$2 AND attempts<3 AND ((state='queued' AND available_at<=NOW()) OR (state='running' AND lease_until<NOW())) FOR UPDATE SKIP LOCKED",
        [row.id, row.source_id],
      )
    ).rows[0];
    if (!current) return null;
    const token = randomUUID();
    await tx.query(
      "UPDATE research_jobs SET state='running',attempts=attempts+1,lease_token=$2,lease_until=NOW()+INTERVAL '1 minute' WHERE id=$1",
      [row.id, token],
    );
    await tx.query(
      "UPDATE source_collection_policies SET last_request_at=NOW() WHERE source_id=$1",
      [row.source_id],
    );
    await tx.query(
      "UPDATE collection_host_locks SET last_claim_at=NOW() WHERE hostname=$1",
      [row.collection_host],
    );
    return {
      id: String(row.id),
      sourceId: String(row.source_id),
      url: String(row.url),
      token,
    };
  });
}
export type CollectionClaim = NonNullable<
  Awaited<ReturnType<typeof claimCollection>>
>;
export async function finishCollection(
  sql: SQL,
  job: CollectionClaim,
  content: string,
  validators: SourceValidators = safeValidators(),
) {
  if (!content.trim() || Buffer.byteLength(content) > 10000)
    throw new RetrievalError("invalid_snapshot");
  return sql.transaction(async (tx) => {
    // Lock the policy first: disabling collection cancels even an in-flight worker.
    const policy = (
      await tx.query(
        "SELECT enabled FROM source_collection_policies WHERE source_id=$1 FOR UPDATE",
        [job.sourceId],
      )
    ).rows[0];
    const current = (
      await tx.query(
        "SELECT id FROM research_jobs WHERE id=$1 AND state='running' AND lease_token=$2 AND lease_until>NOW() FOR UPDATE",
        [job.id, job.token],
      )
    ).rows[0];
    if (!current || !policy?.enabled) return "discarded";
    const hash = createHash("sha256").update(content).digest("hex"),
      snapshotId = randomUUID();
    const inserted = (
      await tx.query(
        "INSERT INTO source_snapshots(id,source_id,content_hash,content) VALUES($1,$2,$3,$4) ON CONFLICT(source_id,content_hash) DO UPDATE SET last_seen_at=NOW() RETURNING id",
        [snapshotId, job.sourceId, hash, content],
      )
    ).rows[0];
    await tx.query(
      "INSERT INTO research_candidates(id,snapshot_id) VALUES($1,$2) ON CONFLICT(snapshot_id) DO NOTHING",
      [randomUUID(), inserted.id],
    );
    const valid = safeValidators(validators);
    await tx.query(
      "INSERT INTO source_http_validators(source_id,snapshot_id,url,etag,last_modified) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id) DO UPDATE SET snapshot_id=$2,url=$3,etag=$4,last_modified=$5,updated_at=NOW()",
      [job.sourceId, inserted.id, job.url, valid.etag, valid.lastModified],
    );
    await tx.query(
      "UPDATE research_jobs SET state='done',lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=$1",
      [job.id],
    );
    return inserted.id === snapshotId ? "captured" : "unchanged";
  });
}
export type SourceCache = SourceValidators & {
  snapshotId: string;
  url: string;
};
export async function sourceCache(
  sql: SQL,
  job: CollectionClaim,
): Promise<SourceCache | null> {
  const row = (
    await sql.query(
      "SELECT snapshot_id,url,etag,last_modified FROM source_http_validators WHERE source_id=$1 AND url=$2",
      [job.sourceId, job.url],
    )
  ).rows[0];
  return row
    ? {
        snapshotId: String(row.snapshot_id),
        url: String(row.url),
        ...safeValidators({ etag: row.etag, lastModified: row.last_modified }),
      }
    : null;
}
export async function finishNotModified(
  sql: SQL,
  job: CollectionClaim,
  cache: SourceCache | null,
  validators: SourceValidators,
) {
  return sql.transaction(async (tx) => {
    const policy = (
      await tx.query(
        "SELECT enabled FROM source_collection_policies WHERE source_id=$1 FOR UPDATE",
        [job.sourceId],
      )
    ).rows[0];
    const current = (
      await tx.query(
        "SELECT id FROM research_jobs WHERE id=$1 AND state='running' AND lease_token=$2 AND lease_until>NOW() FOR UPDATE",
        [job.id, job.token],
      )
    ).rows[0];
    if (!current || !policy?.enabled) return "discarded";
    if (!cache || cache.url !== job.url || (!cache.etag && !cache.lastModified))
      throw new RetrievalError("unexpected_not_modified");
    const stored = (
      await tx.query(
        "SELECT snapshot_id,url,etag,last_modified FROM source_http_validators WHERE source_id=$1 FOR UPDATE",
        [job.sourceId],
      )
    ).rows[0];
    if (
      !stored ||
      stored.snapshot_id !== cache.snapshotId ||
      stored.url !== cache.url ||
      stored.etag !== cache.etag ||
      stored.last_modified !== cache.lastModified
    )
      throw new RetrievalError("validator_cache_changed");
    await tx.query(
      "UPDATE source_snapshots SET last_seen_at=NOW() WHERE id=$1 AND source_id=$2",
      [cache.snapshotId, job.sourceId],
    );
    const valid = safeValidators(validators);
    await tx.query(
      "UPDATE source_http_validators SET etag=$2,last_modified=$3,updated_at=NOW() WHERE source_id=$1",
      [job.sourceId, valid.etag, valid.lastModified],
    );
    await tx.query(
      "UPDATE research_jobs SET state='done',lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=$1",
      [job.id],
    );
    return "not_modified";
  });
}
export async function failCollection(
  sql: SQL,
  job: CollectionClaim,
  error: unknown,
) {
  return sql.transaction(async (tx) => {
    const policy = (
      await tx.query(
        "SELECT enabled FROM source_collection_policies WHERE source_id=$1 FOR UPDATE",
        [job.sourceId],
      )
    ).rows[0];
    const current = (
      await tx.query(
        "SELECT attempts FROM research_jobs WHERE id=$1 AND state='running' AND lease_token=$2 AND lease_until>NOW() FOR UPDATE",
        [job.id, job.token],
      )
    ).rows[0];
    if (!current || !policy?.enabled) return "discarded";
    const retry = error instanceof RetrievalError ? error.retryAfter : null;
    const code =
      error instanceof RetrievalError ? error.code : "collection_failed";
    if (retry)
      await tx.query(
        "INSERT INTO source_retry_after(source_id,retry_after_at,requires_review) VALUES($1,$2,$3) ON CONFLICT(source_id) DO UPDATE SET retry_after_at=GREATEST(source_retry_after.retry_after_at,EXCLUDED.retry_after_at),requires_review=source_retry_after.requires_review OR EXCLUDED.requires_review,updated_at=NOW()",
        [job.sourceId, retry.until, retry.requiresReview],
      );
    await tx.query(
      "UPDATE research_jobs SET state=CASE WHEN attempts>=3 OR $3 THEN 'failed' ELSE 'queued' END,available_at=GREATEST(NOW()+INTERVAL '5 minutes',COALESCE($4::timestamptz,NOW())),lease_token=NULL,lease_until=NULL,error_code=$2 WHERE id=$1",
      [job.id, code, retry?.requiresReview ?? false, retry?.until ?? null],
    );
    return "retry_or_failed";
  });
}
export async function collectOne(
  sql: SQL,
  retrieve: (
    url: string,
    validators: SourceValidators,
  ) => Promise<string | SourceResponse> = retrieveSourceResponse,
) {
  const job = await claimCollection(sql);
  if (!job) return "empty";
  try {
    const cache = await sourceCache(sql, job);
    const result = await retrieve(job.url, safeValidators(cache ?? {}));
    if (typeof result === "string")
      return await finishCollection(sql, job, result);
    if (result.status === "not_modified")
      return await finishNotModified(sql, job, cache, result.validators);
    return await finishCollection(sql, job, result.content, result.validators);
  } catch (error) {
    return failCollection(sql, job, error);
  }
}
export async function researchDashboard(sql: SQL, actor: string) {
  await requireAdmin(sql, actor);
  const sources = (
    await sql.query(
      "SELECT s.id,s.name,s.url,s.collection_host,s.synthetic,s.source_type,s.source_language,s.metadata_version,COALESCE(p.enabled,false) AS enabled,p.permission_note,p.next_due_at,COALESCE(p.cadence_hours,24) AS cadence_hours,COALESCE(p.request_delay_seconds,0) AS request_delay_seconds,p.last_request_at,COALESCE(p.schedule_mode,'fixed') AS schedule_mode,p.last_scheduled_at,COALESCE(h.request_delay_seconds,0) AS host_delay_seconds,COALESCE(h.version,0) AS host_policy_version FROM sources s LEFT JOIN source_collection_policies p ON p.source_id=s.id LEFT JOIN collection_host_locks h ON h.hostname=s.collection_host ORDER BY s.created_at DESC LIMIT 100",
    )
  ).rows;
  const counts = await sourceJobCounts(
    sql,
    actor,
    sources.map((source) => String(source.id)),
  );
  for (const source of sources)
    source.collection_counts = counts[String(source.id)];
  return {
    sources,
    jobs: (
      await sql.query(
        "SELECT id,source_id,state,attempts,error_code,created_at FROM research_jobs ORDER BY created_at DESC LIMIT 50",
      )
    ).rows,
    candidates: (
      await sql.query(
        "SELECT c.id,c.state,c.opportunity_id,f.source_id,f.content,f.fetched_at FROM research_candidates c JOIN source_snapshots f ON f.id=c.snapshot_id ORDER BY c.created_at DESC LIMIT 25",
      )
    ).rows,
  };
}

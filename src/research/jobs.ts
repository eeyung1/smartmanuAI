import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError, requireAdmin } from "../catalogue/service";
export const jobIdSchema = z.string().min(1).max(100);
export const jobActionSchema = z
  .object({
    action: z.enum(["cancel", "retry"]),
    expectedState: z.enum(["queued", "running", "done", "failed", "cancelled"]),
    expectedAttempts: z.number().int().min(0).max(3),
    note: z.string().trim().min(10).max(1000),
  })
  .strict();
export async function collectionJob(sql: SQL, actor: string, id: string) {
  await requireAdmin(sql, actor);
  jobIdSchema.parse(id);
  const job = (
    await sql.query(
      "SELECT j.id,j.source_id,j.state,j.attempts,j.error_code,j.created_at,j.available_at,j.lease_until,r.retry_after_at,COALESCE(r.requires_review,false) AS requires_review,s.name AS source_name,s.url,s.synthetic,COALESCE(p.enabled,false) AS enabled FROM research_jobs j JOIN sources s ON s.id=j.source_id LEFT JOIN source_collection_policies p ON p.source_id=s.id LEFT JOIN source_retry_after r ON r.source_id=s.id WHERE j.id=$1",
      [id],
    )
  ).rows[0];
  if (!job) throw new CatalogueError(404, "Collection job not found.");
  // One cancellation and one retry are the only allowed transitions for an original job.
  const actions = (
    await sql.query(
      "SELECT id,action,actor_id,note,previous_state,previous_attempts,replacement_job_id,created_at FROM research_job_actions WHERE job_id=$1 ORDER BY created_at,id LIMIT 2",
      [id],
    )
  ).rows;
  const predecessor =
    (
      await sql.query(
        "SELECT job_id FROM research_job_actions WHERE replacement_job_id=$1 LIMIT 1",
        [id],
      )
    ).rows[0]?.job_id ?? null;
  return { job, actions, predecessor };
}
export async function actOnCollectionJob(
  sql: SQL,
  actor: string,
  id: string,
  input: unknown,
) {
  await requireAdmin(sql, actor);
  jobIdSchema.parse(id);
  const value = jobActionSchema.parse(input);
  return sql.transaction(async (tx) => {
    // Owner first prevents a new shared audit contribution racing account deletion.
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR SHARE", [actor]);
    if (
      (
        await tx.query(
          "SELECT id FROM account_deletion_requests WHERE user_id=$1 AND state='queued'",
          [actor],
        )
      ).rows.length
    )
      throw new CatalogueError(409, "Account deletion is pending.");
    const target = (
      await tx.query("SELECT source_id FROM research_jobs WHERE id=$1", [id])
    ).rows[0];
    if (!target) throw new CatalogueError(404, "Collection job not found.");
    // Match source-policy updates and collection completion: source, policy, then job.
    const source = (
      await tx.query(
        "SELECT synthetic,url FROM sources WHERE id=$1 FOR UPDATE",
        [target.source_id],
      )
    ).rows[0];
    const policy = (
      await tx.query(
        "SELECT enabled FROM source_collection_policies WHERE source_id=$1 FOR UPDATE",
        [target.source_id],
      )
    ).rows[0];
    const job = (
      await tx.query(
        "SELECT state,attempts,available_at FROM research_jobs WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (
      job.state !== value.expectedState ||
      Number(job.attempts) !== value.expectedAttempts
    )
      throw new CatalogueError(
        409,
        "Collection job changed. Reload before acting.",
      );
    let replacement: string | null = null;
    if (value.action === "cancel") {
      if (!["queued", "running"].includes(String(job.state)))
        throw new CatalogueError(
          409,
          "Only queued or running collection jobs can be cancelled.",
        );
      await tx.query(
        "UPDATE research_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=$1",
        [id],
      );
    } else {
      if (!["failed", "cancelled"].includes(String(job.state)))
        throw new CatalogueError(
          409,
          "Only failed or cancelled collection jobs can be retried.",
        );
      if (
        !policy?.enabled ||
        source.synthetic ||
        new URL(String(source.url)).hostname.endsWith(".test")
      )
        throw new CatalogueError(
          409,
          "An enabled, non-synthetic source policy is required to retry collection.",
        );
      if (
        (
          await tx.query(
            "SELECT id FROM research_job_actions WHERE job_id=$1 AND action='retry'",
            [id],
          )
        ).rows.length
      )
        throw new CatalogueError(
          409,
          "This collection job already has a replacement.",
        );
      if (
        (
          await tx.query(
            "SELECT id FROM research_jobs WHERE source_id=$1 AND state IN ('queued','running')",
            [target.source_id],
          )
        ).rows.length
      )
        throw new CatalogueError(
          409,
          "This source already has an active collection job.",
        );
      const cooldown = (
        await tx.query(
          "SELECT retry_after_at,requires_review FROM source_retry_after WHERE source_id=$1",
          [target.source_id],
        )
      ).rows[0];
      if (cooldown?.requires_review)
        throw new CatalogueError(
          409,
          "Retry-After pause requires source-policy review.",
        );
      replacement = randomUUID();
      await tx.query(
        "INSERT INTO research_jobs(id,source_id,available_at) VALUES($1,$2,GREATEST(NOW(),$3::timestamptz,COALESCE($4::timestamptz,NOW())))",
        [
          replacement,
          target.source_id,
          job.available_at,
          cooldown?.retry_after_at ?? null,
        ],
      );
      // A scheduled run should not immediately enqueue a second job after this replacement finishes.
      await tx.query(
        "UPDATE source_collection_policies SET next_due_at=GREATEST(next_due_at,NOW()+INTERVAL '1 day') WHERE source_id=$1",
        [target.source_id],
      );
    }
    await tx.query(
      "INSERT INTO research_job_actions(id,job_id,action,actor_id,note,previous_state,previous_attempts,replacement_job_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        id,
        value.action,
        actor,
        value.note,
        job.state,
        job.attempts,
        replacement,
      ],
    );
    return { saved: true, replacementJobId: replacement };
  });
}

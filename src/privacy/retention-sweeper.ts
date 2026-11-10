import { timingSafeEqual } from "node:crypto";
import type { SQL } from "../db";
import { CatalogueError, requireAdmin } from "../catalogue/service";

export const RETENTION_DEFAULTS = {
  deliveryLogsDays: 90,
  evidenceSnapshotDays: 180,
  expiredTokenDays: 30,
} as const;

export type RetentionWindows = {
  deliveryLogsDays?: number;
  evidenceSnapshotDays?: number;
  expiredTokenDays?: number;
};

export type RetentionSweepOptions = {
  operatorId?: string;
  jobKey?: string;
  expectedJobKey?: string;
  dryRun?: boolean;
  now?: Date;
  windows?: RetentionWindows;
  batchSize?: number;
  audit?: (report: RetentionSweepReport) => Promise<void> | void;
};

export type RetentionSweepReport = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  dryRun: boolean;
  authorizedAs: "operator" | "job";
  windows: Required<RetentionWindows>;
  deleted: Record<string, number>;
  candidates: Record<string, number>;
};

type Step = {
  name: string;
  table: string;
  key: string;
  where: string;
};

function windowValue(
  value: number | undefined,
  fallback: number,
  label: string,
) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 3650)
    throw new CatalogueError(400, `${label} retention window is invalid.`);
  return value;
}

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Applies operational retention windows to local operational records.
 *
 * Catalogue audit history (opportunities, revisions and sources) is never
 * removed here; only delivery logs, expired ephemeral tokens and captured
 * evidence snapshots that no longer back a live candidate are eligible.
 */
export async function executeRetentionSweep(
  sql: SQL,
  options: RetentionSweepOptions = {},
) {
  const started = options.now ?? new Date();
  if (!Number.isFinite(started.getTime()))
    throw new CatalogueError(400, "Invalid retention sweep time.");
  const dryRun = options.dryRun === true;
  const batchSize = options.batchSize === undefined ? 500 : options.batchSize;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000)
    throw new CatalogueError(400, "Retention batch size is invalid.");
  const windows = {
    deliveryLogsDays: windowValue(
      options.windows?.deliveryLogsDays,
      RETENTION_DEFAULTS.deliveryLogsDays,
      "Delivery log",
    ),
    evidenceSnapshotDays: windowValue(
      options.windows?.evidenceSnapshotDays,
      RETENTION_DEFAULTS.evidenceSnapshotDays,
      "Evidence snapshot",
    ),
    expiredTokenDays: windowValue(
      options.windows?.expiredTokenDays,
      RETENTION_DEFAULTS.expiredTokenDays,
      "Expired token",
    ),
  };

  let authorizedAs: "operator" | "job" | null = null;
  if (options.operatorId) {
    await requireAdmin(sql, options.operatorId);
    authorizedAs = "operator";
  } else if (
    options.jobKey &&
    options.expectedJobKey &&
    sameSecret(options.jobKey, options.expectedJobKey)
  )
    authorizedAs = "job";
  if (!authorizedAs)
    throw new CatalogueError(
      403,
      "Retention sweep requires operator authority or a valid job key.",
    );

  const deliveryCutoff = new Date(
    started.getTime() - windows.deliveryLogsDays * 86_400_000,
  ).toISOString();
  const snapshotCutoff = new Date(
    started.getTime() - windows.evidenceSnapshotDays * 86_400_000,
  ).toISOString();
  const tokenCutoff = new Date(
    started.getTime() - windows.expiredTokenDays * 86_400_000,
  ).toISOString();

  const steps: Step[] = [
    {
      name: "delivery_simulations",
      table: "delivery_simulations",
      key: "id",
      where: `created_at < $1 AND state IN ('accepted','failed','suppressed')`,
    },
    {
      name: "email_digest_attempts",
      table: "email_digest_attempts",
      key: "message_id",
      where: `created_at < $1`,
    },
    {
      name: "auth_session",
      table: "auth_session",
      key: "id",
      where: `expires_at < $1`,
    },
    {
      name: "auth_verification",
      table: "auth_verification",
      key: "id",
      where: `expires_at < $1`,
    },
    {
      name: "telegram_link_tokens",
      table: "telegram_link_tokens",
      key: "token_hash",
      where: `expires_at < $1`,
    },
    {
      name: "notification_unsubscribe_tokens",
      table: "notification_unsubscribe_tokens",
      key: "nonce_hash",
      where: `expires_at < $1`,
    },
    {
      name: "research_usage",
      table: "research_usage",
      key: "id",
      where: `candidate_id IN (SELECT c.id FROM research_candidates c JOIN source_snapshots s ON s.id=c.snapshot_id WHERE c.state='rejected' AND s.fetched_at < $1)`,
    },
    {
      name: "research_candidates",
      table: "research_candidates",
      key: "id",
      where: `state='rejected' AND snapshot_id IN (SELECT id FROM source_snapshots WHERE fetched_at < $1)`,
    },
    {
      name: "source_http_validators",
      table: "source_http_validators",
      key: "source_id",
      where: `snapshot_id IN (SELECT id FROM source_snapshots WHERE fetched_at < $1)`,
    },
    {
      name: "source_snapshots",
      table: "source_snapshots",
      key: "id",
      where: `fetched_at < $1 AND NOT EXISTS(SELECT 1 FROM research_candidates c WHERE c.snapshot_id=source_snapshots.id) AND NOT EXISTS(SELECT 1 FROM source_http_validators v WHERE v.snapshot_id=source_snapshots.id)`,
    },
  ];

  const cutoffFor = (name: string) =>
    name === "research_usage" ||
    name === "research_candidates" ||
    name === "source_http_validators" ||
    name === "source_snapshots"
      ? snapshotCutoff
      : name === "delivery_simulations" || name === "email_digest_attempts"
        ? deliveryCutoff
        : tokenCutoff;

  const deleted: Record<string, number> = {};
  const candidates: Record<string, number> = {};
  const begin = Date.now();

  for (const step of steps) {
    const cutoff = cutoffFor(step.name);
    if (dryRun) {
      const counted = (
        await sql.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM ${step.table} WHERE ${step.where}`,
          [cutoff],
        )
      ).rows[0];
      candidates[step.name] = Number(counted?.count ?? 0);
      continue;
    }
    let removed = 0;
    for (;;) {
      const affected = await sql.transaction(async (tx) => {
        const result = await tx.query(
          `DELETE FROM ${step.table} WHERE ${step.key} IN (SELECT ${step.key} FROM ${step.table} WHERE ${step.where} LIMIT ${batchSize}) RETURNING ${step.key}`,
          [cutoff],
        );
        return result.rows.length;
      });
      removed += affected;
      if (!affected) break;
    }
    deleted[step.name] = removed;
  }

  const finishedAt = new Date();
  const report: RetentionSweepReport = {
    startedAt: started.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Date.now() - begin,
    dryRun,
    authorizedAs,
    windows,
    deleted,
    candidates,
  };
  if (options.audit) await options.audit(report);
  return report;
}

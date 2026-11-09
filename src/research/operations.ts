import { sourceDueSQL } from "./schedule-policy";
import type { SQL } from "../db";
import { requireAdmin } from "../catalogue/service";
type Counts<K extends string> = Record<K, string>;
type OverviewRow = {
  jobs: Counts<
    "total" | "queued" | "running" | "done" | "failed" | "cancelled"
  >;
  candidates: Counts<"total" | "pending" | "drafted" | "rejected">;
  sources: Counts<
    "total" | "enabled" | "paused" | "reviewHolds" | "futureHolds" | "due"
  >;
  usage: Counts<
    "total" | "reserved" | "completed" | "uncertain" | "reservationMicros"
  >;
  aging: {
    queuedReady: string;
    busyHosts: string;
    coolingHosts: string;
    expiredLeases: string;
    oldestQueuedAt: string | null;
    oldestQueuedAgeSeconds: string | null;
    oldestPendingAt: string | null;
    oldestPendingAgeSeconds: string | null;
  };
  budget: { limitMicros: string; reservedMicros: string } | null;
  failureWarnings: {
    total: string;
    items: { sourceId: string; sourceName: string }[];
  };
  observedAt: string;
};
/** One statement gives the summary one database snapshot without returning captured content or private account data. */
export async function operationsOverview(sql: SQL, actor: string) {
  await requireAdmin(sql, actor);
  const row = (
    await sql.query<OverviewRow>(`WITH terminal_jobs AS (
 SELECT source_id,state,ROW_NUMBER() OVER(PARTITION BY source_id ORDER BY created_at DESC,id DESC) AS rank
 FROM research_jobs WHERE state IN ('done','failed','cancelled') AND created_at<=NOW()
), warning_sources AS (
 SELECT source_id FROM terminal_jobs WHERE rank<=2 GROUP BY source_id HAVING COUNT(*)=2 AND BOOL_AND(state='failed')
)
SELECT
 (SELECT jsonb_build_object('total',COUNT(*)::text,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceId',source_id,'sourceName',name)) FROM (SELECT w.source_id,s.name FROM warning_sources w JOIN sources s ON s.id=w.source_id ORDER BY w.source_id LIMIT 10) bounded),'[]'::jsonb)) FROM warning_sources) AS "failureWarnings",
 (SELECT jsonb_build_object('total',COUNT(*)::text,'queued',(COUNT(*) FILTER(WHERE state='queued'))::text,'running',(COUNT(*) FILTER(WHERE state='running'))::text,'done',(COUNT(*) FILTER(WHERE state='done'))::text,'failed',(COUNT(*) FILTER(WHERE state='failed'))::text,'cancelled',(COUNT(*) FILTER(WHERE state='cancelled'))::text) FROM research_jobs) AS jobs,
 (SELECT jsonb_build_object('total',COUNT(*)::text,'pending',(COUNT(*) FILTER(WHERE state='pending'))::text,'drafted',(COUNT(*) FILTER(WHERE state='drafted'))::text,'rejected',(COUNT(*) FILTER(WHERE state='rejected'))::text) FROM research_candidates) AS candidates,
 (SELECT jsonb_build_object('total',COUNT(*)::text,'enabled',(COUNT(*) FILTER(WHERE p.enabled))::text,'paused',(COUNT(*) FILTER(WHERE NOT COALESCE(p.enabled,false)))::text,'reviewHolds',(COUNT(*) FILTER(WHERE r.requires_review))::text,'futureHolds',(COUNT(*) FILTER(WHERE r.retry_after_at>NOW()))::text,'due',(COUNT(*) FILTER(WHERE p.enabled AND ${sourceDueSQL}))::text) FROM sources s LEFT JOIN source_collection_policies p ON p.source_id=s.id LEFT JOIN source_retry_after r ON r.source_id=s.id) AS sources,
 (SELECT jsonb_build_object('total',COUNT(*)::text,'reserved',(COUNT(*) FILTER(WHERE state='reserved'))::text,'completed',(COUNT(*) FILTER(WHERE state='completed'))::text,'uncertain',(COUNT(*) FILTER(WHERE state='uncertain'))::text,'reservationMicros',COALESCE(SUM(reserved_micros),0)::text) FROM research_usage) AS usage,
 (SELECT jsonb_build_object(
 'queuedReady',(COUNT(*) FILTER(WHERE j.state='queued' AND j.available_at<=NOW() AND j.attempts<3 AND p.enabled AND (h.last_claim_at IS NULL OR h.last_claim_at+h.request_delay_seconds*INTERVAL '1 second'<=NOW()) AND NOT EXISTS(SELECT 1 FROM sources busy_source JOIN research_jobs busy_job ON busy_job.source_id=busy_source.id WHERE busy_source.collection_host=s.collection_host AND busy_job.state='running' AND busy_job.lease_until>NOW()) AND (p.last_request_at IS NULL OR p.last_request_at+p.request_delay_seconds*INTERVAL '1 second'<=NOW()) AND NOT COALESCE(r.requires_review,false) AND (r.retry_after_at IS NULL OR r.retry_after_at<=NOW())))::text,
 'coolingHosts',(SELECT COUNT(*)::text FROM collection_host_locks WHERE last_claim_at IS NOT NULL AND last_claim_at+request_delay_seconds*INTERVAL '1 second'>NOW()),
 'busyHosts',(SELECT COUNT(DISTINCT busy_source.collection_host)::text FROM sources busy_source JOIN research_jobs busy_job ON busy_job.source_id=busy_source.id WHERE busy_job.state='running' AND busy_job.lease_until>NOW()),
 'expiredLeases',(COUNT(*) FILTER(WHERE j.state='running' AND j.lease_until<NOW()))::text,
 'oldestQueuedAt',to_char((MIN(j.created_at) FILTER(WHERE j.state='queued')) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'oldestQueuedAgeSeconds',CASE WHEN (MIN(j.created_at) FILTER(WHERE j.state='queued')) IS NULL THEN NULL ELSE GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (NOW()-(MIN(j.created_at) FILTER(WHERE j.state='queued'))))))::text END,
 'oldestPendingAt',(SELECT to_char(MIN(created_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM research_candidates WHERE state='pending'),
 'oldestPendingAgeSeconds',(SELECT CASE WHEN MIN(created_at) IS NULL THEN NULL ELSE GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (NOW()-MIN(created_at)))))::text END FROM research_candidates WHERE state='pending')
 ) FROM research_jobs j JOIN sources s ON s.id=j.source_id LEFT JOIN source_collection_policies p ON p.source_id=j.source_id LEFT JOIN source_retry_after r ON r.source_id=j.source_id LEFT JOIN collection_host_locks h ON h.hostname=s.collection_host WHERE j.state IN ('queued','running')) AS aging,
 (SELECT jsonb_build_object('limitMicros',limit_micros::text,'reservedMicros',reserved_micros::text) FROM budget WHERE id=1) AS budget,
 to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "observedAt"`)
  ).rows[0];
  return {
    ...row,
    budget: row.budget
      ? {
          ...row.budget,
          reservationStatus: budgetReservationStatus(
            row.budget.limitMicros,
            row.budget.reservedMicros,
          ),
          availableMicros: (BigInt(row.budget.limitMicros) >
          BigInt(row.budget.reservedMicros)
            ? BigInt(row.budget.limitMicros) - BigInt(row.budget.reservedMicros)
            : 0n
          ).toString(),
          overLimit:
            BigInt(row.budget.reservedMicros) > BigInt(row.budget.limitMicros),
        }
      : null,
  };
}
export function formatBudgetUnits(micros: string) {
  const value = BigInt(micros),
    absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 1000000n}.${String(absolute % 1000000n).padStart(6, "0")}`;
}

export function durationParts(seconds: string) {
  const total = BigInt(seconds);
  return {
    days: (total / 86400n).toString(),
    hours: ((total % 86400n) / 3600n).toString(),
    minutes: ((total % 3600n) / 60n).toString(),
    seconds: (total % 60n).toString(),
  };
}

/** Threshold comparisons never round or convert database bigint values to Number. */
export function budgetReservationStatus(
  limitMicros: string,
  reservedMicros: string,
) {
  const limit = BigInt(limitMicros),
    reserved = BigInt(reservedMicros);
  const level: "normal" | "warning" | "critical" | "full" =
    limit === 0n || reserved >= limit
      ? "full"
      : reserved * 100n >= limit * 90n
        ? "critical"
        : reserved * 100n >= limit * 70n
          ? "warning"
          : "normal";
  const hundredths = limit > 0n ? (reserved * 10000n) / limit : null;
  return {
    level,
    percent:
      hundredths === null
        ? null
        : `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}`,
  };
}

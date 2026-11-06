import type { SQL } from "../db";
import { requireAdmin } from "../catalogue/service";
type Counts<K extends string> = Record<K, string>;
type OverviewRow = {
  jobs: Counts<
    "total" | "queued" | "running" | "done" | "failed" | "cancelled"
  >;
  candidates: Counts<"total" | "pending" | "drafted" | "rejected">;
  sources: Counts<
    "total" | "enabled" | "paused" | "reviewHolds" | "futureHolds"
  >;
  usage: Counts<
    "total" | "reserved" | "completed" | "uncertain" | "reservationMicros"
  >;
  budget: { limitMicros: string; reservedMicros: string } | null;
  observedAt: string;
};
/** One statement gives the summary one database snapshot without returning source/user payloads. */
export async function operationsOverview(sql: SQL, actor: string) {
  await requireAdmin(sql, actor);
  const row = (
    await sql.query<OverviewRow>(`SELECT
 (SELECT jsonb_build_object('total',COUNT(*)::text,'queued',(COUNT(*) FILTER(WHERE state='queued'))::text,'running',(COUNT(*) FILTER(WHERE state='running'))::text,'done',(COUNT(*) FILTER(WHERE state='done'))::text,'failed',(COUNT(*) FILTER(WHERE state='failed'))::text,'cancelled',(COUNT(*) FILTER(WHERE state='cancelled'))::text) FROM research_jobs) AS jobs,
 (SELECT jsonb_build_object('total',COUNT(*)::text,'pending',(COUNT(*) FILTER(WHERE state='pending'))::text,'drafted',(COUNT(*) FILTER(WHERE state='drafted'))::text,'rejected',(COUNT(*) FILTER(WHERE state='rejected'))::text) FROM research_candidates) AS candidates,
 (SELECT jsonb_build_object('total',COUNT(*)::text,'enabled',(COUNT(*) FILTER(WHERE p.enabled))::text,'paused',(COUNT(*) FILTER(WHERE NOT COALESCE(p.enabled,false)))::text,'reviewHolds',(COUNT(*) FILTER(WHERE r.requires_review))::text,'futureHolds',(COUNT(*) FILTER(WHERE r.retry_after_at>NOW()))::text) FROM sources s LEFT JOIN source_collection_policies p ON p.source_id=s.id LEFT JOIN source_retry_after r ON r.source_id=s.id) AS sources,
 (SELECT jsonb_build_object('total',COUNT(*)::text,'reserved',(COUNT(*) FILTER(WHERE state='reserved'))::text,'completed',(COUNT(*) FILTER(WHERE state='completed'))::text,'uncertain',(COUNT(*) FILTER(WHERE state='uncertain'))::text,'reservationMicros',COALESCE(SUM(reserved_micros),0)::text) FROM research_usage) AS usage,
 (SELECT jsonb_build_object('limitMicros',limit_micros::text,'reservedMicros',reserved_micros::text) FROM budget WHERE id=1) AS budget,
 to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "observedAt"`)
  ).rows[0];
  return {
    ...row,
    budget: row.budget
      ? {
          ...row.budget,
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

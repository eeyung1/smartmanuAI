import type { SQL } from "../db";
import { sourceDueSQL } from "./schedule-policy";

export type SourceRefreshCycle = {
  lastCompleteRefreshAt: string | null;
  totalSources: string;
  completedSources: string;
  overdueCount: string;
};

type RefreshRow = SourceRefreshCycle;

/**
 * Returns a conservative shared-catalogue refresh watermark.
 *
 * A successful changed or unchanged collection updates source_snapshots.last_seen_at.
 * The complete watermark is therefore the oldest latest observation across all
 * currently enabled, non-synthetic sources. It remains unavailable until every
 * source in that set has at least one successful observation.
 */
export async function trackSourceRefreshCycle(
  sql: SQL,
): Promise<SourceRefreshCycle> {
  const row = (
    await sql.query<RefreshRow>(`WITH active_sources AS (
  SELECT p.source_id,
    ${sourceDueSQL} AS overdue,
    (SELECT MAX(snapshot.last_seen_at)
      FROM source_snapshots snapshot
      WHERE snapshot.source_id=p.source_id
        AND snapshot.last_seen_at<=NOW()) AS latest_observation
  FROM source_collection_policies p
  JOIN sources s ON s.id=p.source_id
  WHERE p.enabled AND NOT s.synthetic
), totals AS (
  SELECT COUNT(*)::text AS "totalSources",
    COUNT(latest_observation)::text AS "completedSources",
    COUNT(*) FILTER(WHERE overdue)::text AS "overdueCount",
    COUNT(*) AS total_count,
    COUNT(latest_observation) AS completed_count,
    MIN(latest_observation) AS complete_watermark
  FROM active_sources
)
SELECT "totalSources","completedSources","overdueCount",
  CASE WHEN total_count>0 AND completed_count=total_count
    THEN to_char(complete_watermark AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ELSE NULL END AS "lastCompleteRefreshAt"
FROM totals`)
  ).rows[0];

  return {
    lastCompleteRefreshAt: row.lastCompleteRefreshAt,
    totalSources: String(row.totalSources),
    completedSources: String(row.completedSources),
    overdueCount: String(row.overdueCount),
  };
}

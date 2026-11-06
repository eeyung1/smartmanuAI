import type { SQL } from "../db";
import { requireAdmin } from "../catalogue/service";
export type SourceJobCounts = {
  total: string;
  completed: string;
  failed: string;
  active: string;
  cancelled: string;
};
const emptyCounts = (): SourceJobCounts => ({
  total: "0",
  completed: "0",
  failed: "0",
  active: "0",
  cancelled: "0",
});
/** Current stored job states, not an attempt ledger or a publication-success metric. */
export async function sourceJobCounts(
  sql: SQL,
  actor: string,
  sourceIds: readonly string[],
) {
  await requireAdmin(sql, actor);
  const ids = [...new Set(sourceIds)];
  const result: Record<string, SourceJobCounts> = Object.fromEntries(
    ids.map((id) => [id, emptyCounts()]),
  );
  if (!ids.length) return result;
  const rows = (
    await sql.query(
      `SELECT source_id,COUNT(*) AS total,
  COUNT(*) FILTER(WHERE state='done') AS completed,
  COUNT(*) FILTER(WHERE state='failed') AS failed,
  COUNT(*) FILTER(WHERE state IN ('queued','running')) AS active,
  COUNT(*) FILTER(WHERE state='cancelled') AS cancelled
  FROM research_jobs WHERE source_id=ANY($1::text[]) GROUP BY source_id`,
      [ids],
    )
  ).rows;
  for (const row of rows)
    result[String(row.source_id)] = {
      total: String(row.total),
      completed: String(row.completed),
      failed: String(row.failed),
      active: String(row.active),
      cancelled: String(row.cancelled),
    };
  return result;
}

import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError, requireAdmin } from "./service";
export const historyQuerySchema = z
  .object({ before: z.coerce.number().int().min(1).max(2147483647).optional() })
  .strict();
export function parseHistoryQuery(params: URLSearchParams) {
  const input: Record<string, unknown> = Object.create(null);
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    input[key] = values.length === 1 ? values[0] : values;
  }
  return historyQuerySchema.parse(input);
}
export type HistorySnapshot = {
  revision: number;
  state: string;
  details: Record<string, unknown>;
  evidence: Record<string, unknown>;
};
export type SnapshotField = { present: boolean; value?: unknown };
export type HistoryChange = {
  field: string;
  before: SnapshotField;
  after: SnapshotField;
};
function canonical(value: unknown): string | undefined {
  if (Array.isArray(value))
    return "array:" + JSON.stringify(value.map((item) => canonical(item)));
  if (value !== null && typeof value === "object")
    return (
      "object:" +
      JSON.stringify(
        Object.keys(value)
          .sort()
          .map((key) => [
            key,
            canonical((value as Record<string, unknown>)[key]),
          ]),
      )
    );
  return JSON.stringify(value);
}
export function historyChanges(
  current: HistorySnapshot,
  previous: HistorySnapshot,
): HistoryChange[] {
  const changes: HistoryChange[] = [];
  function compare(field: string, before: SnapshotField, after: SnapshotField) {
    if (
      before.present !== after.present ||
      canonical(before.value) !== canonical(after.value)
    )
      changes.push({ field, before, after });
  }
  compare(
    "state",
    { present: true, value: previous.state },
    { present: true, value: current.state },
  );
  for (const group of ["details", "evidence"] as const) {
    for (const key of [
      ...new Set([
        ...Object.keys(previous[group]),
        ...Object.keys(current[group]),
      ]),
    ].sort()) {
      compare(
        group + "." + key,
        {
          present: Object.hasOwn(previous[group], key),
          value: previous[group][key],
        },
        {
          present: Object.hasOwn(current[group], key),
          value: current[group][key],
        },
      );
    }
  }
  return changes;
}
export async function auditHistory(
  sql: SQL,
  userId: string,
  opportunityId: string,
  input: unknown = {},
) {
  await requireAdmin(sql, userId);
  const query = historyQuerySchema.parse(input);
  z.string().min(1).max(100).parse(opportunityId);
  const record = (
    await sql.query(
      "SELECT o.id,o.revision,o.state,o.details->>'title' AS title,s.name AS source_name,s.url AS source_url,s.synthetic FROM opportunities o JOIN sources s ON s.id=o.source_id WHERE o.id=$1",
      [opportunityId],
    )
  ).rows[0];
  if (!record) throw new CatalogueError(404, "Opportunity not found.");
  const pageSize = 20;
  const rows = (
    await sql.query(
      "SELECT revision,state,details,evidence,note,actor_id,created_at FROM opportunity_revisions WHERE opportunity_id=$1 AND ($2::integer IS NULL OR revision<$2) AND revision<=$3 ORDER BY revision DESC LIMIT 21",
      [opportunityId, query.before ?? null, record.revision],
    )
  ).rows;
  const items = rows.slice(0, pageSize).map((row, index) => {
    const current = row as unknown as HistorySnapshot,
      previous = rows[index + 1] as unknown as HistorySnapshot | undefined;
    const comparison =
      current.revision === 1
        ? "initial"
        : previous?.revision === current.revision - 1
          ? "compared"
          : "unavailable";
    return {
      revision: current.revision,
      state: current.state,
      details: current.details,
      evidence: current.evidence,
      note: String(row.note),
      actorId: String(row.actor_id),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(String(row.created_at)).toISOString(),
      comparison,
      changes:
        comparison === "compared" ? historyChanges(current, previous!) : [],
    };
  });
  const aliases = (
    await sql.query(
      "SELECT s.id,s.name,s.url,s.synthetic,a.recorded_at FROM opportunity_source_aliases a JOIN sources s ON s.id=a.source_id WHERE a.opportunity_id=$1 ORDER BY a.recorded_at,s.id LIMIT 101",
      [opportunityId],
    )
  ).rows;
  return {
    record,
    items,
    sourceAliases: aliases.slice(0, 100).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      url: row.synthetic ? null : String(row.url),
      synthetic: row.synthetic === true,
      recordedAt:
        row.recorded_at instanceof Date
          ? row.recorded_at.toISOString()
          : new Date(String(row.recorded_at)).toISOString(),
    })),
    aliasesTruncated: aliases.length > 100,
    pageSize,
    nextBefore: rows.length > pageSize ? items.at(-1)!.revision : null,
  };
}

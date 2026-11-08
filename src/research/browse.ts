import { sourceJobCounts } from "./source-counts";
import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError, requireAdmin } from "../catalogue/service";
import { queryFields } from "../catalogue/admin-browse";
import { researchDashboard } from "./collection";
export const researchSelectionSchema = z
  .object({ source: z.uuid().optional(), candidate: z.uuid().optional() })
  .strict()
  .refine(
    (value) => !(value.source && value.candidate),
    "Choose one research target.",
  );
export const researchStates = {
  sources: ["enabled", "paused"],
  jobs: ["queued", "running", "done", "failed", "cancelled"],
  candidates: ["pending", "drafted", "rejected"],
} as const;
export const researchBrowseSchema = z
  .object({
    kind: z.enum(["sources", "jobs", "candidates"]).default("sources"),
    q: z.string().trim().max(120).optional(),
    source: z.uuid().optional(),
    state: z
      .enum([
        "enabled",
        "paused",
        "queued",
        "running",
        "done",
        "failed",
        "cancelled",
        "pending",
        "drafted",
        "rejected",
      ])
      .optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine(
    (value) =>
      !value.state ||
      (researchStates[value.kind] as readonly string[]).includes(value.state),
    "Choose a state for the selected research list.",
  );
export function parseResearchBrowse(params: URLSearchParams) {
  return researchBrowseSchema.parse(
    Object.fromEntries(
      Object.entries(queryFields(params)).filter(([, value]) => value !== ""),
    ),
  );
}
export async function browseResearch(
  sql: SQL,
  actor: string,
  input: unknown = {},
) {
  await requireAdmin(sql, actor);
  const filters = researchBrowseSchema.parse(input),
    values: unknown[] = [],
    where: string[] = [];
  const kind = filters.kind;
  const from =
    kind === "sources"
      ? "sources s LEFT JOIN source_collection_policies p ON p.source_id=s.id"
      : kind === "jobs"
        ? "research_jobs j JOIN sources s ON s.id=j.source_id"
        : "research_candidates c JOIN source_snapshots f ON f.id=c.snapshot_id JOIN sources s ON s.id=f.source_id";
  if (filters.q) {
    values.push("%" + filters.q.replace(/[\\%_]/g, "\\$&") + "%");
    where.push(
      kind === "sources"
        ? "(s.name ILIKE $1 OR s.url ILIKE $1 OR s.id ILIKE $1)"
        : kind === "jobs"
          ? "(s.name ILIKE $1 OR j.id ILIKE $1)"
          : "(s.name ILIKE $1 OR c.id ILIKE $1)",
    );
  }
  if (filters.source) {
    values.push(filters.source);
    where.push(`s.id=$${values.length}`);
  }
  if (filters.state) {
    if (kind === "sources")
      where.push(
        filters.state === "enabled"
          ? "COALESCE(p.enabled,false)"
          : "NOT COALESCE(p.enabled,false)",
      );
    else {
      values.push(filters.state);
      where.push(`${kind === "jobs" ? "j" : "c"}.state=$${values.length}`);
    }
  }
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  const total = Number(
    (await sql.query(`SELECT COUNT(*) AS total FROM ${from}${clause}`, values))
      .rows[0].total,
  );
  const projection =
    kind === "sources"
      ? "s.id,s.name AS source_name,s.url,s.synthetic,COALESCE(p.enabled,false) AS enabled"
      : kind === "jobs"
        ? "j.id,j.source_id,j.state,j.attempts,j.error_code,s.name AS source_name,s.synthetic"
        : "c.id,c.state,c.opportunity_id,f.source_id,LEFT(f.content,240) AS excerpt,s.name AS source_name,s.synthetic";
  const order =
    kind === "sources"
      ? "s.created_at DESC,s.id DESC"
      : kind === "jobs"
        ? "j.created_at DESC,j.id DESC"
        : "c.created_at DESC,c.id DESC";
  const items = (
    await sql.query(
      `SELECT ${projection} FROM ${from}${clause} ORDER BY ${order} LIMIT 25 OFFSET $${values.length + 1}`,
      [...values, (filters.page - 1) * 25],
    )
  ).rows;
  return { filters, items, total, page: filters.page, pageSize: 25 };
}
export async function selectedResearchData(
  sql: SQL,
  actor: string,
  input: unknown = {},
) {
  await requireAdmin(sql, actor);
  const selection = researchSelectionSchema.parse(input);
  const data = await researchDashboard(sql, actor);
  let sourceId = selection.source;
  if (selection.candidate) {
    let candidate = data.candidates.find(
      (row) => row.id === selection.candidate,
    );
    if (!candidate)
      candidate = (
        await sql.query(
          "SELECT c.id,c.state,c.opportunity_id,f.source_id,f.content,f.fetched_at FROM research_candidates c JOIN source_snapshots f ON f.id=c.snapshot_id WHERE c.id=$1",
          [selection.candidate],
        )
      ).rows[0];
    if (!candidate) throw new CatalogueError(404, "Candidate not found.");
    data.candidates = [
      candidate,
      ...data.candidates.filter((row) => row.id !== candidate!.id),
    ];
    sourceId = String(candidate.source_id);
  }
  if (sourceId) {
    let source = data.sources.find((row) => row.id === sourceId);
    if (!source) {
      source = (
        await sql.query(
          "SELECT s.id,s.name,s.url,s.collection_host,s.synthetic,s.source_type,s.source_language,s.metadata_version,COALESCE(p.enabled,false) AS enabled,p.permission_note,p.next_due_at,COALESCE(p.cadence_hours,24) AS cadence_hours,COALESCE(p.request_delay_seconds,0) AS request_delay_seconds,p.last_request_at,COALESCE(h.request_delay_seconds,0) AS host_delay_seconds,COALESCE(h.version,0) AS host_policy_version FROM sources s LEFT JOIN source_collection_policies p ON p.source_id=s.id LEFT JOIN collection_host_locks h ON h.hostname=s.collection_host WHERE s.id=$1",
          [sourceId],
        )
      ).rows[0];
      if (source)
        source.collection_counts = (
          await sourceJobCounts(sql, actor, [sourceId])
        )[sourceId];
    }
    if (!source) throw new CatalogueError(404, "Source not found.");
    data.sources = [
      source,
      ...data.sources.filter((row) => row.id !== source!.id),
    ];
  }
  return { data, selection };
}

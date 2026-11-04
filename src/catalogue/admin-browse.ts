import { z } from "zod";
import type { SQL } from "../db";
import { adminCatalogue, CatalogueError, requireAdmin } from "./service";
const selectionSchema = z.string().min(1).max(100);
export const editorQuerySchema = z
  .object({
    edit: selectionSchema.optional(),
    source: selectionSchema.optional(),
  })
  .strict()
  .refine(
    (value) => !(value.edit && value.source),
    "Choose one editor target.",
  );
export const adminBrowseSchema = z
  .object({
    kind: z.enum(["opportunities", "sources"]).default("opportunities"),
    q: z.string().trim().max(120).optional(),
    state: z
      .enum(["draft", "published", "closed", "rejected", "archived"])
      .optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine(
    (value) => value.kind !== "sources" || value.state === undefined,
    "Source lists do not have opportunity states.",
  );
export function queryFields(params: URLSearchParams) {
  const values: Record<string, unknown> = Object.create(null);
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    values[key] = all.length === 1 ? all[0] : all;
  }
  return values;
}
export function parseAdminBrowse(params: URLSearchParams) {
  const values = queryFields(params);
  return adminBrowseSchema.parse(
    Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== ""),
    ),
  );
}
export async function browseAdmin(
  sql: SQL,
  userId: string,
  input: unknown = {},
) {
  await requireAdmin(sql, userId);
  const filters = adminBrowseSchema.parse(input),
    values: unknown[] = [],
    where: string[] = [];
  if (filters.q) {
    values.push("%" + filters.q.replace(/[\\%_]/g, "\\$&") + "%");
    where.push(
      filters.kind === "sources"
        ? `(s.name ILIKE $1 OR s.url ILIKE $1)`
        : `(o.details->>'title' ILIKE $1 OR o.details->>'organizer' ILIKE $1 OR s.name ILIKE $1)`,
    );
  }
  if (filters.state) {
    values.push(filters.state);
    where.push(`o.state=$${values.length}`);
  }
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  const from =
    filters.kind === "sources"
      ? "sources s"
      : "opportunities o JOIN sources s ON s.id=o.source_id";
  const total = Number(
    (await sql.query(`SELECT COUNT(*) AS total FROM ${from}${clause}`, values))
      .rows[0].total,
  );
  const projection =
    filters.kind === "sources"
      ? "s.id,s.name AS title,s.url,s.synthetic,s.created_at AS changed_at"
      : "o.id,o.details->>'title' AS title,o.state,o.revision,o.source_id,s.name AS source_name,s.synthetic,o.updated_at AS changed_at";
  const order =
    filters.kind === "sources"
      ? "s.created_at DESC,s.id DESC"
      : "o.updated_at DESC,o.id DESC";
  const items = (
    await sql.query(
      `SELECT ${projection} FROM ${from}${clause} ORDER BY ${order} LIMIT 25 OFFSET $${values.length + 1}`,
      [...values, (filters.page - 1) * 25],
    )
  ).rows;
  return { filters, items, total, pageSize: 25, page: filters.page };
}
export async function reviewEditorData(
  sql: SQL,
  userId: string,
  input: unknown = {},
) {
  await requireAdmin(sql, userId);
  const query = editorQuerySchema.parse(input);
  const data = await adminCatalogue(sql, userId);
  let editing: Record<string, unknown> | null = null;
  if (query.edit) {
    editing =
      (await sql.query("SELECT * FROM opportunities WHERE id=$1", [query.edit]))
        .rows[0] ?? null;
    if (!editing) throw new CatalogueError(404, "Opportunity not found.");
    if (!data.opportunities.some((row) => row.id === editing!.id))
      data.opportunities.push(editing);
  }
  const sourceId = query.source ?? (editing ? String(editing.source_id) : null);
  if (sourceId && !data.sources.some((row) => row.id === sourceId)) {
    const source = (
      await sql.query("SELECT * FROM sources WHERE id=$1", [sourceId])
    ).rows[0];
    if (!source) throw new CatalogueError(404, "Source not found.");
    data.sources.push(source);
  }
  return { ...data, editing, sourceId };
}

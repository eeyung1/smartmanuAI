import { randomUUID } from "node:crypto";
import type { SQL } from "../db";
import {
  sourceSchema,
  draftSchema,
  detailsSchema,
  evidenceSchema,
  reviewSchema,
  validatePublication,
  type Details,
} from "./schema";
export class CatalogueError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireAdmin(sql: SQL, userId: string) {
  if (
    !(
      await sql.query("SELECT user_id FROM admin_roles WHERE user_id=$1", [
        userId,
      ])
    ).rows.length
  )
    throw new CatalogueError(403, "Administrator access required.");
}
export async function createSource(sql: SQL, userId: string, input: unknown) {
  await requireAdmin(sql, userId);
  const v = sourceSchema.parse(input);
  const id = randomUUID();
  await sql.query(
    "INSERT INTO sources(id,name,url,synthetic,created_by) VALUES($1,$2,$3,$4,$5)",
    [id, v.name, new URL(v.url).href, v.synthetic, userId],
  );
  return { id, ...v };
}
export async function createDraft(
  sql: SQL,
  userId: string,
  input: unknown,
  id: string = randomUUID(),
) {
  await requireAdmin(sql, userId);
  const v = draftSchema.parse(input);
  await sql.transaction(async (tx) => {
    if (
      !(await tx.query("SELECT id FROM sources WHERE id=$1", [v.sourceId])).rows
        .length
    )
      throw new CatalogueError(400, "Unknown source.");
    await tx.query(
      "INSERT INTO opportunities(id,source_id,revision,state,details,evidence) VALUES($1,$2,1,'draft',$3,$4)",
      [id, v.sourceId, JSON.stringify(v.details), JSON.stringify(v.evidence)],
    );
    await tx.query(
      "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES($1,1,'draft',$2,$3,$4,$5)",
      [
        id,
        JSON.stringify(v.details),
        JSON.stringify(v.evidence),
        userId,
        v.note,
      ],
    );
  });
  return { id, revision: 1, state: "draft" };
}
export async function reviewOpportunity(
  sql: SQL,
  userId: string,
  id: string,
  input: unknown,
) {
  await requireAdmin(sql, userId);
  const v = reviewSchema.parse(input);
  return sql.transaction(async (tx) => {
    const record = (
      await tx.query("SELECT * FROM opportunities WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!record) throw new CatalogueError(404, "Opportunity not found.");
    if (record.revision !== v.expectedRevision)
      throw new CatalogueError(
        409,
        "This record changed. Reload before reviewing.",
      );
    if (v.action !== "revise" && (v.details || v.evidence))
      throw new CatalogueError(400, "Revise the draft before publishing.");
    if (v.action === "revise" && (!v.details || !v.evidence))
      throw new CatalogueError(400, "A revision needs details and evidence.");
    if (
      v.action === "close" &&
      !["published", "closed"].includes(String(record.state))
    )
      throw new CatalogueError(
        400,
        "Only published records can be closed. Reject an unpublished draft instead.",
      );
    const details = detailsSchema.parse(v.details ?? record.details),
      evidence = evidenceSchema.parse(v.evidence ?? record.evidence);
    const state =
      v.action === "publish"
        ? "published"
        : v.action === "close"
          ? "closed"
          : v.action === "reject"
            ? "rejected"
            : "draft";
    if (v.action === "publish") {
      if (!v.verified)
        throw new CatalogueError(
          400,
          "Verify the official source and field evidence before publishing.",
        );
      try {
        validatePublication(details);
      } catch (e) {
        throw new CatalogueError(400, (e as Error).message);
      }
      if (
        details.deadline &&
        details.deadline <= new Date().toISOString().slice(0, 10)
      )
        throw new CatalogueError(
          400,
          "Past or closing-today dates cannot be newly published under the conservative date-only policy.",
        );
    }
    const revision = Number(record.revision) + 1;
    await tx.query(
      "UPDATE opportunities SET revision=$2,state=$3,details=$4,evidence=$5,verified_at=CASE WHEN $3='published' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1",
      [id, revision, state, JSON.stringify(details), JSON.stringify(evidence)],
    );
    await tx.query(
      "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        revision,
        state,
        JSON.stringify(details),
        JSON.stringify(evidence),
        userId,
        v.note,
      ],
    );
    return { id, revision, state };
  });
}
export type PublicOpportunity = {
  id: string;
  revision: number;
  state: string;
  details: Details;
  source_name: string;
  source_url: string;
  synthetic: boolean;
  verified_at: string | null;
  available: boolean;
};
function publicRecord(row: Record<string, unknown>): PublicOpportunity {
  const details = detailsSchema.parse(row.details),
    verified = row.verified_at
      ? new Date(String(row.verified_at)).toISOString()
      : null;
  return {
    id: String(row.id),
    revision: Number(row.revision),
    state: String(row.state),
    details,
    source_name: String(row.source_name),
    source_url: String(row.source_url),
    synthetic: row.synthetic === true,
    verified_at: verified,
    available:
      row.state === "published" &&
      !!verified &&
      Date.parse(verified) >= Date.now() - 7 * 86400000 &&
      (!details.deadline ||
        details.deadline > new Date().toISOString().slice(0, 10)),
  };
}
const projection =
  "o.id,o.revision,o.state,o.details,o.verified_at,s.name AS source_name,s.url AS source_url,s.synthetic";
export async function publicOpportunity(sql: SQL, id: string) {
  const row = (
    await sql.query(
      `SELECT ${projection} FROM opportunities o JOIN sources s ON s.id=o.source_id WHERE o.id=$1 AND o.state IN ('published','closed')`,
      [id],
    )
  ).rows[0];
  return row ? publicRecord(row) : null;
}
export type Filters = {
  q?: string;
  category?: string;
  language?: string;
  funding?: string;
  page?: number;
};
export async function listPublic(sql: SQL, filters: Filters = {}) {
  const params: unknown[] = [];
  const where = [
    "o.state='published'",
    "o.verified_at>=NOW()-INTERVAL '7 days'",
    "(o.details->>'deadline' IS NULL OR o.details->>'deadline'>TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD'))",
  ];
  for (const [key, value] of [
    ["category", filters.category],
    ["teachingLanguage", filters.language],
    ["funding", filters.funding],
  ] as const) {
    if (value) {
      params.push(value);
      where.push(`o.details->>'${key}'=$${params.length}`);
    }
  }
  if (filters.q) {
    params.push("%" + filters.q.replace(/[\\%_]/g, "\\$&") + "%");
    where.push(
      `(o.details->>'title' ILIKE $${params.length} OR o.details->>'organizer' ILIKE $${params.length} OR o.details->>'summary' ILIKE $${params.length})`,
    );
  }
  if (!filters.funding)
    where.push(
      "o.details->>'funding' IN ('fully_funded','tuition_only','free_participation')",
    );
  const page = Math.max(1, Math.min(1000, Math.floor(filters.page ?? 1)));
  const clause = where.join(" AND ");
  const total = Number(
    (
      await sql.query(
        `SELECT COUNT(*) AS total FROM opportunities o WHERE ${clause}`,
        params,
      )
    ).rows[0].total,
  );
  const rows = (
    await sql.query(
      `SELECT ${projection} FROM opportunities o JOIN sources s ON s.id=o.source_id WHERE ${clause} ORDER BY o.verified_at DESC,o.id LIMIT 12 OFFSET $${params.length + 1}`,
      [...params, (page - 1) * 12],
    )
  ).rows;
  return { items: rows.map(publicRecord), total, page, pageSize: 12 };
}
export async function adminCatalogue(sql: SQL, userId: string) {
  await requireAdmin(sql, userId);
  const sources = (
    await sql.query("SELECT * FROM sources ORDER BY created_at DESC LIMIT 100")
  ).rows;
  const opportunities = (
    await sql.query(
      "SELECT * FROM opportunities ORDER BY updated_at DESC LIMIT 100",
    )
  ).rows;
  return { sources, opportunities };
}
export async function revisionHistory(sql: SQL, userId: string, id: string) {
  await requireAdmin(sql, userId);
  return (
    await sql.query(
      "SELECT revision,state,details,evidence,note,actor_id,created_at FROM opportunity_revisions WHERE opportunity_id=$1 ORDER BY revision DESC",
      [id],
    )
  ).rows;
}

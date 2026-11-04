import { z } from "zod";
import type { SQL } from "../db";
import { publicOpportunity, CatalogueError } from "../catalogue/service";
import { detailsSchema } from "../catalogue/schema";
import { materialFingerprint } from "./matching";
export const trackerChangeSchema = z
  .object({
    opportunityId: z.string().min(1).max(100),
    expectedVersion: z.number().int().min(0),
    action: z.enum(["status", "dismiss", "restore", "remove"]),
    status: z.enum(["interested", "applying", "applied"]).optional(),
  })
  .strict()
  .refine(
    (v) => (v.action === "status" ? !!v.status : v.status === undefined),
    "Supply status only for a status change.",
  );
export const trackerQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    status: z
      .enum(["all", "interested", "applying", "applied", "dismissed"])
      .default("all"),
    search: z.string().trim().max(200).default(""),
  })
  .strict();

export type TrackerQuery = z.infer<typeof trackerQuerySchema>;
export const TRACKER_PAGE_SIZE = 12;
export async function updateTracker(sql: SQL, userId: string, input: unknown) {
  const value = trackerChangeSchema.parse(input);
  return sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      userId,
    ]);
    await tx.query("SELECT id FROM opportunities WHERE id=$1 FOR SHARE", [
      value.opportunityId,
    ]);
    const item = (
      await tx.query(
        "SELECT * FROM saved_items WHERE user_id=$1 AND opportunity_id=$2 FOR UPDATE",
        [userId, value.opportunityId],
      )
    ).rows[0];
    if (Number(item?.version ?? 0) !== value.expectedVersion)
      throw new CatalogueError(409, "Your tracker changed. Reload and retry.");
    if (!item && value.action !== "dismiss")
      throw new CatalogueError(404, "Saved item not found.");
    let fingerprint: string | null = null;
    if (value.action === "dismiss") {
      const record = await publicOpportunity(tx, value.opportunityId);
      if (!record?.available)
        throw new CatalogueError(404, "Opportunity is unavailable.");
      fingerprint = materialFingerprint(record.details);
    }
    if (!item) {
      await tx.query(
        "INSERT INTO saved_items(user_id,opportunity_id,status,saved,dismissed_fingerprint) VALUES($1,$2,'interested',false,$3)",
        [userId, value.opportunityId, fingerprint],
      );
      return { version: 1 };
    }
    if (value.action === "status" && !item.saved)
      throw new CatalogueError(
        400,
        "Save this opportunity before updating its status.",
      );
    const result = await tx.query(
      "UPDATE saved_items SET status=$3,saved=$4,dismissed_fingerprint=$5,version=version+1,updated_at=NOW() WHERE user_id=$1 AND opportunity_id=$2 RETURNING version",
      [
        userId,
        value.opportunityId,
        value.action === "status" ? value.status : item.status,
        value.action === "remove" ? false : item.saved,
        value.action === "dismiss"
          ? fingerprint
          : value.action === "restore"
            ? null
            : item.dismissed_fingerprint,
      ],
    );
    return result.rows[0];
  });
}
function trackerItem(row: Record<string, unknown>) {
  return {
    opportunity_id: String(row.opportunity_id),
    status: row.status as "interested" | "applying" | "applied",
    saved: row.saved === true,
    version: Number(row.version),
    title: row.title ? String(row.title) : null,
    state: row.state ? String(row.state) : null,
    dismissed: !!row.dismissed_fingerprint,
    materialChanged:
      row.state === "published" &&
      !!row.dismissed_fingerprint &&
      row.dismissed_fingerprint !==
        materialFingerprint(detailsSchema.parse(row.details)),
    available:
      row.state === "published" &&
      !!row.verified_at &&
      new Date(String(row.verified_at)).getTime() >=
        Date.now() - 7 * 86400000 &&
      (!(row.details as { deadline?: string | null })?.deadline ||
        String((row.details as { deadline: string }).deadline) >
          new Date().toISOString().slice(0, 10)),
  };
}

const trackerFrom =
  " FROM saved_items t LEFT JOIN opportunities o ON o.id=t.opportunity_id LEFT JOIN LATERAL (SELECT details FROM opportunity_revisions WHERE opportunity_id=o.id AND state IN ('published','closed') ORDER BY revision DESC LIMIT 1) r ON true";

export async function listTrackerPage(
  sql: SQL,
  userId: string,
  input: unknown = {},
) {
  const query = trackerQuerySchema.parse(input);
  const conditions = [
    "t.user_id=$1",
    "(t.saved OR t.dismissed_fingerprint IS NOT NULL)",
  ];
  const params: unknown[] = [userId];
  if (query.status === "dismissed")
    conditions.push("t.dismissed_fingerprint IS NOT NULL");
  else if (query.status !== "all") {
    params.push(query.status);
    conditions.push(`t.saved AND t.status=$${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
    const search = `$${params.length}`;
    conditions.push(
      `(LOWER(COALESCE(r.details->>'title',o.details->>'title','')) LIKE LOWER(${search}) ESCAPE '\\' OR LOWER(COALESCE(r.details->>'organizer',o.details->>'organizer','')) LIKE LOWER(${search}) ESCAPE '\\' OR LOWER(COALESCE(r.details->>'summary',o.details->>'summary','')) LIKE LOWER(${search}) ESCAPE '\\')`,
    );
  }
  const where = " WHERE " + conditions.join(" AND ");
  const total = Number(
    (await sql.query("SELECT COUNT(*) AS count" + trackerFrom + where, params))
      .rows[0].count,
  );
  const pageParams = [
    ...params,
    TRACKER_PAGE_SIZE,
    (query.page - 1) * TRACKER_PAGE_SIZE,
  ];
  const rows = (
    await sql.query(
      "SELECT t.*,o.state,o.revision,o.details,o.verified_at,r.details->>'title' AS title" +
        trackerFrom +
        where +
        ` ORDER BY t.updated_at DESC,t.opportunity_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      pageParams,
    )
  ).rows;
  return {
    items: rows.map(trackerItem),
    total,
    page: query.page,
    pageSize: TRACKER_PAGE_SIZE,
    status: query.status,
    search: query.search,
  };
}

export async function listTracker(sql: SQL, userId: string) {
  const rows = (
    await sql.query(
      "SELECT t.*,o.state,o.revision,o.details,o.verified_at,r.details->>'title' AS title" +
        trackerFrom +
        " WHERE t.user_id=$1 AND (t.saved OR t.dismissed_fingerprint IS NOT NULL) ORDER BY t.updated_at DESC,t.opportunity_id LIMIT 100",
      [userId],
    )
  ).rows;
  return rows.map(trackerItem);
}
export async function listSaved(sql: SQL, userId: string) {
  return (await listTracker(sql, userId)).filter((row) => row.saved);
}

import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError } from "../catalogue/service";
const PAGE_SIZE = 20;
export const sessionQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
  .strict();
const revokeSchema = z
  .object({ sessionId: z.string().trim().min(1).max(200) })
  .strict();
export type SessionActor = { userId: string; sessionId: string };
async function authorize(
  sql: SQL,
  actor: SessionActor,
  now: Date,
  write: boolean,
) {
  const user = await sql.query(
    `SELECT id FROM auth_user WHERE id=$1 FOR ${write ? "NO KEY UPDATE" : "SHARE"}`,
    [actor.userId],
  );
  if (!user.rows.length) throw new CatalogueError(401, "Sign in required.");
  const current = (
    await sql.query(
      "SELECT created_at AT TIME ZONE 'UTC' AS created_at FROM auth_session WHERE user_id=$1 AND id=$2 AND expires_at>($3::timestamptz AT TIME ZONE 'UTC')",
      [actor.userId, actor.sessionId, now.toISOString()],
    )
  ).rows[0];
  if (!current) throw new CatalogueError(401, "Sign in required.");
  const created =
    current.created_at instanceof Date
      ? current.created_at.getTime()
      : new Date(String(current.created_at)).getTime();
  if (
    !Number.isFinite(created) ||
    created > now.getTime() + 60000 ||
    now.getTime() - created > 600000
  )
    throw new CatalogueError(
      403,
      "Sign in again before managing your sessions.",
    );
}
export async function listAccountSessions(
  sql: SQL,
  actor: SessionActor,
  input: unknown = {},
  now = new Date(),
) {
  const { page } = sessionQuerySchema.parse(input);
  return sql.transaction(async (tx) => {
    await authorize(tx, actor, now, false);
    const total = Number(
      (
        await tx.query(
          "SELECT COUNT(*) AS total FROM auth_session WHERE user_id=$1 AND expires_at>($2::timestamptz AT TIME ZONE 'UTC')",
          [actor.userId, now.toISOString()],
        )
      ).rows[0].total,
    );
    const rows = (
      await tx.query(
        "SELECT id,created_at AT TIME ZONE 'UTC' AS created_at,updated_at AT TIME ZONE 'UTC' AS updated_at,expires_at AT TIME ZONE 'UTC' AS expires_at,LEFT(COALESCE(user_agent,''),200) AS browser FROM auth_session WHERE user_id=$1 AND expires_at>($2::timestamptz AT TIME ZONE 'UTC') ORDER BY created_at DESC,id LIMIT $3 OFFSET $4",
        [actor.userId, now.toISOString(), PAGE_SIZE, (page - 1) * PAGE_SIZE],
      )
    ).rows;
    return {
      page,
      pageSize: PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      items: rows.map((row) => ({
        id: String(row.id),
        current: row.id === actor.sessionId,
        createdAt: new Date(String(row.created_at)).toISOString(),
        updatedAt: new Date(String(row.updated_at)).toISOString(),
        expiresAt: new Date(String(row.expires_at)).toISOString(),
        browser: String(row.browser).replace(/[\u0000-\u001f\u007f]/g, " "),
      })),
    };
  });
}
export async function revokeAccountSession(
  sql: SQL,
  actor: SessionActor,
  input: unknown,
  now = new Date(),
) {
  const { sessionId } = revokeSchema.parse(input);
  return sql.transaction(async (tx) => {
    await authorize(tx, actor, now, true);
    const removed = await tx.query(
      "DELETE FROM auth_session WHERE user_id=$1 AND id=$2 RETURNING id",
      [actor.userId, sessionId],
    );
    return {
      revoked: removed.rows.length > 0,
      currentSessionRevoked:
        removed.rows.length > 0 && sessionId === actor.sessionId,
    };
  });
}

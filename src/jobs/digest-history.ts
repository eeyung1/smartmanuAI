import { z } from "zod";
import type { SQL } from "../db";
const channelSchema = z.enum(["all", "email", "telegram"]);
const stateSchema = z.enum(["all", "queued", "accepted", "suppressed"]);
export const digestHistoryQuerySchema = z
  .object({
    channel: channelSchema.default("all"),
    state: stateSchema.default("all"),
    cursor: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();
const cursorSchema = z
  .object({
    at: z.iso.datetime({ precision: 6 }),
    id: z.string().min(1).max(200),
    channel: channelSchema,
    state: stateSchema,
  })
  .strict();
const PAGE_SIZE = 20;
export async function browseDigestHistory(
  sql: SQL,
  userId: string,
  input: unknown = {},
) {
  const query = digestHistoryQuerySchema.parse(input);
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (query.cursor) {
    const bytes = Buffer.from(query.cursor, "base64url");
    if (bytes.toString("base64url") !== query.cursor)
      throw new SyntaxError("Invalid history cursor");
    cursor = cursorSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (cursor.channel !== query.channel || cursor.state !== query.state)
      throw new SyntaxError("History cursor filters changed");
  }
  const params: unknown[] = [userId];
  const where = ["user_id=$1"];
  if (query.channel !== "all") {
    params.push(query.channel);
    where.push(`channel=$${params.length}`);
  }
  if (query.state !== "all") {
    params.push(query.state);
    where.push(`state=$${params.length}`);
  }
  if (cursor) {
    params.push(cursor.at, cursor.id);
    where.push(
      `(created_at<$${params.length - 1}::timestamptz OR (created_at=$${params.length - 1}::timestamptz AND id>$${params.length}))`,
    );
  }
  params.push(PAGE_SIZE + 1);
  const rows = (
    await sql.query(
      `SELECT id,channel,state,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at FROM notification_digests WHERE ${where.join(" AND ")} ORDER BY notification_digests.created_at DESC,id LIMIT $${params.length}`,
      params,
    )
  ).rows;
  const items = rows.slice(0, PAGE_SIZE).map((row) => ({
    id: String(row.id),
    channel: String(row.channel),
    state: String(row.state),
    createdAt: String(row.created_at),
  }));
  const last = items.at(-1);
  return {
    items,
    filters: { channel: query.channel, state: query.state },
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? Buffer.from(
            JSON.stringify({
              at: last.createdAt,
              id: last.id,
              channel: query.channel,
              state: query.state,
            }),
          ).toString("base64url")
        : null,
  };
}

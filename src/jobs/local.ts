import { randomUUID } from "node:crypto";
import type { SQL } from "../db";
export async function reserveBudget(sql: SQL, micros: number) {
  if (!Number.isSafeInteger(micros) || micros <= 0)
    throw new Error("Invalid reservation");
  return (
    (
      await sql.query(
        "UPDATE budget SET reserved_micros=reserved_micros+$1 WHERE id=1 AND reserved_micros+$1<=limit_micros RETURNING id",
        [micros],
      )
    ).rows.length === 1
  );
}
export async function queueNotification(
  sql: SQL,
  userId: string,
  eventKey: string,
) {
  await sql.query(
    "INSERT INTO outbox(id,event_key,user_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT(event_key) DO NOTHING",
    [
      randomUUID(),
      JSON.stringify([userId, eventKey]),
      userId,
      JSON.stringify({
        title: "Synthetic local opportunity",
        reviewRequired: true,
      }),
    ],
  );
}
export async function dispatchOne(sql: SQL) {
  const candidate = (
    await sql.query(
      "SELECT id,user_id FROM outbox WHERE state='queued' ORDER BY id LIMIT 1",
    )
  ).rows[0];
  if (!candidate) return "empty";
  return sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      candidate.user_id,
    ]);
    const item = (
      await tx.query<{
        id: string;
        event_key: string;
        user_id: string;
        payload: Record<string, unknown>;
      }>(
        "SELECT * FROM outbox WHERE state='queued' AND id=$1 FOR UPDATE SKIP LOCKED",
        [candidate.id],
      )
    ).rows[0];
    if (!item) return "empty";
    const pref = (
      await tx.query(
        "SELECT enabled,channel FROM notification_preferences WHERE user_id=$1 FOR UPDATE",
        [item.user_id],
      )
    ).rows[0];
    if (!pref?.enabled) {
      await tx.query("UPDATE outbox SET state='suppressed' WHERE id=$1", [
        item.id,
      ]);
      return "suppressed";
    }
    // Transactional local sink only. No provider API or recipient address exists here.
    await tx.query(
      "INSERT INTO sink_messages(event_key,channel,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [item.event_key, pref.channel, JSON.stringify(item.payload)],
    );
    await tx.query("UPDATE outbox SET state='accepted' WHERE id=$1", [item.id]);
    return "accepted";
  });
}

import { randomUUID } from "node:crypto";
import type { SQL } from "../db";

const FRESHNESS_MS = 24 * 60 * 60 * 1000;

export type ReminderRecheckResponse = number | { status: number };
export type ReminderRecheckTransport = (
  url: string,
) => Promise<ReminderRecheckResponse>;

export type ReminderFreshnessCandidate = {
  userId: string;
  opportunityId: string;
  revision: number;
  eventKey: string;
  checkedAt: Date;
  transport?: ReminderRecheckTransport;
};

export type ReminderFreshnessResult = {
  fresh: boolean;
  suppressed: boolean;
  reason:
    | "fresh_source_observation"
    | "fresh_synthetic_review"
    | "http_available"
    | "withdrawn"
    | "candidate_changed"
    | "recheck_unavailable"
    | "source_unavailable"
    | "transport_error";
  checkedAt: string;
  cached: boolean;
};

type CurrentOpportunity = {
  revision: number;
  state: string;
  verified_at: unknown;
  source_url: string;
  synthetic: boolean;
  source_last_seen_at: unknown;
};

function markerKey(eventKey: string) {
  return `deadline-reminder-recheck:${eventKey}`;
}

function storedPayload(value: unknown): ReminderFreshnessResult | null {
  let payload = value;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (
    record.type !== "deadline_reminder_recheck" ||
    typeof record.fresh !== "boolean" ||
    typeof record.reason !== "string" ||
    typeof record.checkedAt !== "string"
  )
    return null;
  return {
    fresh: record.fresh,
    suppressed: !record.fresh,
    reason: record.reason as ReminderFreshnessResult["reason"],
    checkedAt: record.checkedAt,
    cached: true,
  };
}

function recent(value: unknown, now: Date) {
  const observedAt = new Date(String(value));
  return (
    Number.isFinite(observedAt.getTime()) &&
    observedAt.getTime() <= now.getTime() &&
    now.getTime() - observedAt.getTime() <= FRESHNESS_MS
  );
}

/**
 * Verifies and durably records one reminder/source decision. No network request
 * is possible unless the caller supplies a transport. The per-owner lock and
 * unique marker make concurrent and repeated checks idempotent.
 */
export async function verifyReminderCandidateFreshness(
  sql: SQL,
  candidate: ReminderFreshnessCandidate,
): Promise<ReminderFreshnessResult> {
  if (!Number.isFinite(candidate.checkedAt.getTime()))
    throw new Error("Invalid reminder recheck time.");
  const checkedAt = candidate.checkedAt.toISOString();
  const eventKey = markerKey(candidate.eventKey);

  return sql.transaction(async (tx) => {
    await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
      candidate.userId,
    ]);
    const previous = (
      await tx.query("SELECT payload FROM outbox WHERE event_key=$1", [
        eventKey,
      ])
    ).rows[0];
    const cached = storedPayload(previous?.payload);
    if (cached) {
      if (cached.fresh && !recent(cached.checkedAt, candidate.checkedAt))
        return {
          ...cached,
          fresh: false,
          suppressed: true,
          reason: "recheck_unavailable",
        };
      return cached;
    }

    const current = (
      await tx.query<CurrentOpportunity>(
        `SELECT o.revision,o.state,o.verified_at,s.url AS source_url,s.synthetic,
                (SELECT MAX(snapshot.last_seen_at) FROM source_snapshots snapshot
                  WHERE snapshot.source_id=s.id AND snapshot.last_seen_at<=$2) AS source_last_seen_at
           FROM opportunities o JOIN sources s ON s.id=o.source_id
          WHERE o.id=$1 FOR SHARE OF o,s`,
        [candidate.opportunityId, checkedAt],
      )
    ).rows[0];

    let fresh = false;
    let reason: ReminderFreshnessResult["reason"];
    if (!current || current.state !== "published") reason = "withdrawn";
    else if (Number(current.revision) !== candidate.revision)
      reason = "candidate_changed";
    else if (current.synthetic) {
      fresh = recent(current.verified_at, candidate.checkedAt);
      reason = fresh ? "fresh_synthetic_review" : "recheck_unavailable";
    } else if (recent(current.source_last_seen_at, candidate.checkedAt)) {
      fresh = true;
      reason = "fresh_source_observation";
    } else if (!candidate.transport) reason = "recheck_unavailable";
    else {
      try {
        const response = await candidate.transport(current.source_url);
        const status =
          typeof response === "number" ? response : Number(response.status);
        if (status === 404 || status === 410) reason = "withdrawn";
        else if ((status >= 200 && status < 300) || status === 304) {
          fresh = true;
          reason = "http_available";
        } else reason = "source_unavailable";
      } catch {
        reason = "transport_error";
      }
    }

    const result: ReminderFreshnessResult = {
      fresh,
      suppressed: !fresh,
      reason,
      checkedAt,
      cached: false,
    };
    const inserted = await tx.query(
      `INSERT INTO outbox(id,event_key,user_id,state,payload)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING RETURNING id`,
      [
        randomUUID(),
        eventKey,
        candidate.userId,
        // This is an internal idempotency marker, never a queued/accepted delivery.
        "suppressed",
        JSON.stringify({
          type: "deadline_reminder_recheck",
          opportunityId: candidate.opportunityId,
          revision: candidate.revision,
          fresh,
          reason,
          checkedAt,
        }),
      ],
    );
    if (inserted.rows.length) return result;
    const winner = (
      await tx.query("SELECT payload FROM outbox WHERE event_key=$1", [
        eventKey,
      ])
    ).rows[0];
    return storedPayload(winner?.payload) ?? result;
  });
}

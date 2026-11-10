import {
  emailControlsConfig,
  emailSuppression,
} from "../channels/email-controls";
import { detailsSchema } from "../catalogue/schema";
import type { SQL } from "../db";
import {
  deadlineReminderEventKey,
  deadlineReminderThreshold,
  renderDeadlineReminder,
} from "../domain/reminders";
import { LOCAL_CONSENT_VERSION } from "./digests";
import {
  verifyReminderCandidateFreshness,
  type ReminderRecheckTransport,
} from "./reminder-recheck";

const FRESHNESS_MS = 24 * 60 * 60 * 1000;

type ReminderCandidate = {
  user_id: string;
  opportunity_id: string;
  revision: number;
  details: unknown;
  verified_at: unknown;
  channel: "email" | "telegram";
  language: string | null;
  source_url: string;
  synthetic: boolean;
};

export type DeadlineReminderResult = {
  scanned: number;
  sent: number;
  duplicates: number;
  suppressed: number;
};

/**
 * Dispatch due reminders to the configured local sink. No external request is
 * possible unless a source-recheck transport is explicitly injected. Sink event
 * keys are unique, so repeated or concurrent runs do not send the same deadline
 * revision and threshold more than once.
 */
export async function dispatchDeadlineReminders(
  sql: SQL,
  now = new Date(),
  recheckTransport?: ReminderRecheckTransport,
): Promise<DeadlineReminderResult> {
  if (!Number.isFinite(now.getTime()))
    throw new Error("Invalid reminder time.");
  const freshnessBoundary = new Date(
    now.getTime() - FRESHNESS_MS,
  ).toISOString();
  const candidates = (
    await sql.query<ReminderCandidate>(
      `SELECT t.user_id,t.opportunity_id,o.revision,o.details,o.verified_at,
              p.channel,pr.preferences->>'alertLanguage' AS language,
              s.url AS source_url,s.synthetic
         FROM saved_items t
         JOIN opportunities o ON o.id=t.opportunity_id
         JOIN sources s ON s.id=o.source_id
         JOIN notification_preferences p ON p.user_id=t.user_id
         LEFT JOIN profiles pr ON pr.user_id=t.user_id
        WHERE t.saved=true AND (t.status IN ('interested','applying') OR (t.status='applied' AND p.applied_reminders_enabled=true))
          AND o.state='published' AND o.verified_at >= $1
          AND p.enabled=true AND p.deadline_reminders_enabled=true
          AND p.consent_version=$2
        ORDER BY t.user_id,t.opportunity_id`,
      [freshnessBoundary, LOCAL_CONSENT_VERSION],
    )
  ).rows;

  const result: DeadlineReminderResult = {
    scanned: candidates.length,
    sent: 0,
    duplicates: 0,
    suppressed: 0,
  };
  let emailControls: ReturnType<typeof emailControlsConfig> | null = null;

  for (const candidate of candidates) {
    const details = detailsSchema.parse(candidate.details);
    if (!details.deadline) continue;
    const threshold = deadlineReminderThreshold(details.deadline, now);
    if (!threshold) continue;
    const eventKey = deadlineReminderEventKey({
      userId: String(candidate.user_id),
      opportunityId: String(candidate.opportunity_id),
      revision: Number(candidate.revision),
      deadline: details.deadline,
      threshold,
    });
    const freshness = await verifyReminderCandidateFreshness(sql, {
      userId: String(candidate.user_id),
      opportunityId: String(candidate.opportunity_id),
      revision: Number(candidate.revision),
      eventKey,
      checkedAt: now,
      transport: recheckTransport,
    });
    if (!freshness.fresh) {
      result.suppressed++;
      continue;
    }

    const sent = await sql.transaction(async (tx) => {
      await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR NO KEY UPDATE", [
        candidate.user_id,
      ]);
      const current = (
        await tx.query<ReminderCandidate>(
          `SELECT t.user_id,t.opportunity_id,o.revision,o.details,o.verified_at,
                  p.channel,pr.preferences->>'alertLanguage' AS language,
                  s.url AS source_url,s.synthetic
             FROM saved_items t
             JOIN opportunities o ON o.id=t.opportunity_id
             JOIN sources s ON s.id=o.source_id
             JOIN notification_preferences p ON p.user_id=t.user_id
             LEFT JOIN profiles pr ON pr.user_id=t.user_id
            WHERE t.user_id=$1 AND t.opportunity_id=$2 AND t.saved=true
              AND (t.status IN ('interested','applying') OR (t.status='applied' AND p.applied_reminders_enabled=true))
              AND o.state='published' AND o.verified_at >= $3
              AND p.enabled=true AND p.deadline_reminders_enabled=true
              AND p.consent_version=$4
            FOR UPDATE OF t,o,p`,
          [
            candidate.user_id,
            candidate.opportunity_id,
            freshnessBoundary,
            LOCAL_CONSENT_VERSION,
          ],
        )
      ).rows[0];
      if (!current) return "suppressed" as const;

      const currentDetails = detailsSchema.parse(current.details);
      if (!currentDetails.deadline) return "suppressed" as const;
      const currentThreshold = deadlineReminderThreshold(
        currentDetails.deadline,
        now,
      );
      if (!currentThreshold) return "suppressed" as const;
      if (
        Number(current.revision) !== Number(candidate.revision) ||
        currentDetails.deadline !== details.deadline ||
        currentThreshold !== threshold
      )
        return "suppressed" as const;
      const verifiedAt = new Date(String(current.verified_at));
      if (
        !Number.isFinite(verifiedAt.getTime()) ||
        verifiedAt.getTime() > now.getTime() ||
        now.getTime() - verifiedAt.getTime() > FRESHNESS_MS
      )
        return "suppressed" as const;

      if (current.channel === "email") {
        try {
          emailControls ??= emailControlsConfig();
        } catch {
          return "suppressed" as const;
        }
        if (await emailSuppression(tx, String(current.user_id), emailControls))
          return "suppressed" as const;
      }

      const message = renderDeadlineReminder({
        language: current.language ?? "en",
        title: currentDetails.title,
        deadline: currentDetails.deadline,
        threshold: currentThreshold,
      });
      const inserted = await tx.query(
        "INSERT INTO sink_messages(event_key,channel,payload) VALUES($1,$2,$3) ON CONFLICT(event_key) DO NOTHING RETURNING event_key",
        [
          eventKey,
          current.channel,
          JSON.stringify({
            type: "deadline_reminder",
            templateVersion: "1",
            language: current.language ?? "en",
            thresholdDays: currentThreshold,
            deadline: currentDetails.deadline,
            opportunityId: current.opportunity_id,
            opportunityRevision: Number(current.revision),
            title: currentDetails.title,
            organizer: currentDetails.organizer,
            sourceURL: current.synthetic ? null : current.source_url,
            synthetic: current.synthetic,
            message,
          }),
        ],
      );
      return inserted.rows.length ? ("sent" as const) : ("duplicate" as const);
    });

    if (sent === "sent") result.sent++;
    else if (sent === "duplicate") result.duplicates++;
    else result.suppressed++;
  }
  return result;
}

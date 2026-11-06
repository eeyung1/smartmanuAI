import { randomUUID } from "node:crypto";
import type { SQL } from "../db";
import {
  detectMaterialChanges,
  materialChangeEventKey,
  renderMaterialChange,
} from "../domain/material-changes";

type RevisionRow = Record<string, unknown> & {
  opportunity_id: string;
  revision: number;
  state: string;
  details: unknown;
  previous_state: string;
  previous_details: unknown;
  title: string;
  source_url: string;
  synthetic: boolean;
  source_name: string;
  created_at: string | Date;
};

export async function detectMaterialChangeAlerts(sql: SQL, now = new Date()) {
  const revisions = (
    await sql.query<RevisionRow>(
      `SELECT current.opportunity_id,current.revision,current.state,current.details,
              previous.state AS previous_state,previous.details AS previous_details,
              current.details->>'title' AS title,s.url AS source_url,s.synthetic,s.name AS source_name,
              current.created_at
         FROM opportunity_revisions current
         JOIN LATERAL (
           SELECT state,details FROM opportunity_revisions
            WHERE opportunity_id=current.opportunity_id
              AND revision<current.revision AND state='published'
            ORDER BY revision DESC LIMIT 1
         ) previous ON true
         JOIN opportunities o ON o.id=current.opportunity_id
         JOIN sources s ON s.id=o.source_id
        WHERE current.revision>1 AND current.state IN ('published','closed')
        ORDER BY current.created_at,current.opportunity_id,current.revision`,
    )
  ).rows;
  let scanned = 0,
    queued = 0,
    duplicates = 0,
    suppressed = 0;
  for (const revision of revisions) {
    const changes = detectMaterialChanges({
      previousState: revision.previous_state,
      state: revision.state,
      previousDetails: revision.previous_details,
      details: revision.details,
    });
    if (!changes.length) continue;
    scanned++;
    const result = await sql.transaction(async (tx) => {
      const candidateUsers = (
        await tx.query(
          "SELECT user_id FROM saved_items WHERE opportunity_id=$1 AND saved AND status IN ('interested','applying') ORDER BY user_id",
          [revision.opportunity_id],
        )
      ).rows.map((row) => String(row.user_id));
      // Settings/deletion/tracker writes lock the owner first. Do not add newly
      // saved owners to this pass after locking; they are picked up next run.
      const owners = (
        await tx.query(
          "SELECT id FROM auth_user WHERE id=ANY($1::text[]) ORDER BY id FOR NO KEY UPDATE",
          [candidateUsers],
        )
      ).rows.map((row) => String(row.id));
      await tx.query("SELECT id FROM opportunities WHERE id=$1 FOR SHARE", [
        revision.opportunity_id,
      ]);
      const current = (
        await tx.query("SELECT revision,state FROM opportunities WHERE id=$1", [
          revision.opportunity_id,
        ])
      ).rows[0];
      if (
        Number(current?.revision) !== Number(revision.revision) ||
        !["published", "closed"].includes(String(current?.state))
      )
        return { queued: 0, duplicates: 0, suppressed: changes.length };
      const users = (
        await tx.query(
          `SELECT t.user_id,p.channel,COALESCE(pr.preferences->>'alertLanguage','en') AS language
             FROM saved_items t
             JOIN notification_preferences p ON p.user_id=t.user_id
             LEFT JOIN profiles pr ON pr.user_id=t.user_id
            WHERE t.opportunity_id=$1 AND t.saved
              AND t.status IN ('interested','applying')
              AND p.enabled AND p.material_changes_enabled AND p.consent_version='local-sink-v1'
              AND t.user_id=ANY($2::text[])
            ORDER BY t.user_id FOR UPDATE OF t,p`,
          [revision.opportunity_id, owners],
        )
      ).rows;
      let inserted = 0,
        duplicate = 0;
      for (const user of users) {
        for (const change of changes) {
          const eventKey = materialChangeEventKey({
            userId: String(user.user_id),
            opportunityId: revision.opportunity_id,
            revision: Number(revision.revision),
            kind: change.kind,
          });
          const message = renderMaterialChange({
            kind: change.kind,
            language: String(user.language),
            title: String(revision.title),
            previousDeadline: change.previousDeadline,
            deadline: change.deadline,
          });
          const outbox = await tx.query(
            `INSERT INTO outbox(id,event_key,user_id,payload)
             VALUES($1,$2,$3,$4) ON CONFLICT(event_key) DO NOTHING RETURNING id`,
            [
              randomUUID(),
              eventKey,
              user.user_id,
              JSON.stringify({
                type: "material_change",
                channel: String(user.channel),
                change: change.kind,
                priority: "high",
                opportunityId: revision.opportunity_id,
                revision: Number(revision.revision),
                title: String(revision.title),
                organizer: String(revision.source_name),
                sourceUrl: revision.synthetic
                  ? null
                  : String(revision.source_url),
                deadline: change.deadline,
                previousDeadline: change.previousDeadline,
                funding: change.funding,
                previousFunding: change.previousFunding,
                language: String(user.language),
                message,
                detectedAt: now.toISOString(),
              }),
            ],
          );
          if (outbox.rows.length) inserted++;
          else duplicate++;
        }
      }
      return { queued: inserted, duplicates: duplicate, suppressed: 0 };
    });
    queued += result.queued;
    duplicates += result.duplicates;
    suppressed += result.suppressed;
  }
  return { scanned, queued, duplicates, suppressed };
}

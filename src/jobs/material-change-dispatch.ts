import type { SQL } from "../db";
import {
  detectMaterialChanges,
  materialChangeEventKey,
  type MaterialChangeKind,
} from "../domain/material-changes";
import {
  emailControlsConfig,
  emailSuppression,
} from "../channels/email-controls";

/** Called under the owner's notification locks, immediately before local sink insertion. */
export async function currentMaterialChange(
  sql: SQL,
  userId: string,
  eventKey: string,
  payload: Record<string, unknown>,
) {
  if (
    typeof payload.opportunityId !== "string" ||
    !Number.isSafeInteger(payload.revision) ||
    Number(payload.revision) < 1 ||
    ![
      "program_closed",
      "funding_withdrawn",
      "deadline_reduced",
      "deadline_extended",
    ].includes(String(payload.change))
  )
    return false;
  const kind = payload.change as MaterialChangeKind;
  if (
    eventKey !==
    materialChangeEventKey({
      userId,
      opportunityId: payload.opportunityId,
      revision: Number(payload.revision),
      kind,
    })
  )
    return false;
  const row = (
    await sql.query(
      `SELECT o.state,o.details,previous.state AS previous_state,previous.details AS previous_details
     FROM opportunities o JOIN saved_items t ON t.opportunity_id=o.id AND t.user_id=$1
     JOIN opportunity_revisions r ON r.opportunity_id=o.id AND r.revision=o.revision
     JOIN LATERAL (SELECT state,details FROM opportunity_revisions WHERE opportunity_id=o.id AND revision<o.revision AND state='published' ORDER BY revision DESC LIMIT 1) previous ON true
     WHERE o.id=$2 AND o.revision=$3 AND o.state IN ('published','closed') AND r.state=o.state
       AND t.saved AND t.status IN ('interested','applying')
       AND r.created_at>=NOW()-INTERVAL '24 hours' AND r.created_at<=NOW()
     FOR SHARE OF o,t,r`,
      [userId, payload.opportunityId, payload.revision],
    )
  ).rows[0];
  if (
    !row ||
    !detectMaterialChanges({
      previousState: String(row.previous_state),
      state: String(row.state),
      previousDetails: row.previous_details,
      details: row.details,
    }).some((change) => change.kind === kind)
  )
    return false;
  if (
    payload.channel === "email" &&
    (await emailSuppression(sql, userId, emailControlsConfig()))
  )
    return false;
  return true;
}

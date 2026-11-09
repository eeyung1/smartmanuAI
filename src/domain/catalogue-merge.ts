import { z } from "zod";
import type { SQL } from "../db";
import { detailsSchema } from "../catalogue/schema";
import { CatalogueError, requireAdmin } from "../catalogue/service";

export const catalogueMergeSchema = z
  .object({
    targetOpportunityId: z.string().trim().min(1).max(100),
    expectedDuplicateRevision: z.number().int().positive(),
    expectedTargetRevision: z.number().int().positive(),
    note: z.string().trim().min(5).max(1000),
  })
  .strict();

type SavedItem = Record<string, unknown> & {
  user_id: string;
  opportunity_id: string;
  status: "interested" | "applying" | "applied";
  saved: boolean;
  dismissed_fingerprint: string | null;
  version: number;
  updated_at: string;
};

function mergeMarker(duplicateId: string, targetId: string) {
  return `[smartmanu-duplicate-merge:${encodeURIComponent(duplicateId)}:${encodeURIComponent(targetId)}]`;
}

export async function mergeDuplicateOpportunity(
  sql: SQL,
  actorId: string,
  duplicateId: string,
  input: unknown,
) {
  const value = catalogueMergeSchema.parse(input);
  const targetId = value.targetOpportunityId;
  if (duplicateId === targetId)
    throw new CatalogueError(400, "Choose a different surviving opportunity.");
  await requireAdmin(sql, actorId);

  return sql.transaction(async (tx) => {
    // Match tracker writes' user-before-opportunity lock order. This also keeps
    // the revision actor stable against account deletion during the merge.
    if (
      !(
        await tx.query("SELECT id FROM auth_user WHERE id=$1 FOR SHARE", [
          actorId,
        ])
      ).rows.length
    )
      throw new CatalogueError(403, "Administrator access required.");

    const ids = [duplicateId, targetId].sort();
    const locked = (
      await tx.query(
        "SELECT o.id,o.revision,o.state,o.details,o.evidence,o.source_id,s.url AS source_url FROM opportunities o JOIN sources s ON s.id=o.source_id WHERE o.id=ANY($1::text[]) ORDER BY o.id FOR UPDATE OF o",
        [ids],
      )
    ).rows;
    const byId = new Map(locked.map((row) => [String(row.id), row]));
    const duplicate = byId.get(duplicateId),
      target = byId.get(targetId);
    if (!duplicate || !target)
      throw new CatalogueError(404, "Opportunity not found.");

    const marker = mergeMarker(duplicateId, targetId),
      duplicateRevision = Number(duplicate.revision),
      targetRevision = Number(target.revision);
    if (duplicate.state === "archived") {
      const priorMerge = (
        await tx.query(
          "SELECT revision FROM opportunity_revisions WHERE opportunity_id=$1 AND state='archived' AND LEFT(note,LENGTH($2))=$2 ORDER BY revision DESC LIMIT 1",
          [duplicateId, marker],
        )
      ).rows[0];
      if (priorMerge)
        return {
          duplicateOpportunityId: duplicateId,
          targetOpportunityId: targetId,
          duplicateRevision,
          targetRevision,
          movedTrackerItems: 0,
          merged: true,
          alreadyMerged: true,
        };
      throw new CatalogueError(
        409,
        "The duplicate is already archived and was not merged into this opportunity.",
      );
    }
    if (target.state === "archived")
      throw new CatalogueError(
        400,
        "An archived opportunity cannot survive a merge.",
      );
    if (
      duplicateRevision !== value.expectedDuplicateRevision ||
      targetRevision !== value.expectedTargetRevision
    )
      throw new CatalogueError(
        409,
        "An opportunity changed. Reload both records before merging.",
      );

    const identity = (details: unknown) =>
      detailsSchema
        .parse(details)
        .offeringIdentity?.normalize("NFC")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
    const duplicateIdentity = identity(duplicate.details),
      targetIdentity = identity(target.details);
    if (
      duplicateIdentity &&
      targetIdentity &&
      duplicateIdentity !== targetIdentity
    )
      throw new CatalogueError(
        409,
        "Different intake or event editions cannot be merged. Review both identities first.",
      );

    const rows = (
      await tx.query(
        "SELECT user_id,opportunity_id,status,saved,dismissed_fingerprint,version,updated_at::text AS updated_at FROM saved_items WHERE opportunity_id=ANY($1::text[]) ORDER BY user_id,saved_items.updated_at DESC,(opportunity_id=$2) DESC,opportunity_id FOR UPDATE",
        [ids, targetId],
      )
    ).rows as SavedItem[];
    const byUser = new Map<string, Map<string, SavedItem>>();
    for (const row of rows) {
      let items = byUser.get(row.user_id);
      if (!items) byUser.set(row.user_id, (items = new Map()));
      items.set(row.opportunity_id, row);
    }

    let movedTrackerItems = 0;
    for (const [userId, items] of byUser) {
      const from = items.get(duplicateId);
      if (!from) continue;
      const existing = items.get(targetId);
      if (!existing) {
        await tx.query(
          "UPDATE saved_items SET opportunity_id=$2,version=version+1 WHERE user_id=$1 AND opportunity_id=$3",
          [userId, targetId, duplicateId],
        );
      } else {
        // SQL orders exact database timestamps newest first; ties keep the survivor.
        const winner = items.values().next().value!;
        await tx.query(
          "UPDATE saved_items SET status=$3,saved=$4,dismissed_fingerprint=$5,version=$6,updated_at=$7::timestamptz WHERE user_id=$1 AND opportunity_id=$2",
          [
            userId,
            targetId,
            winner.status,
            winner.saved,
            winner.dismissed_fingerprint,
            Math.max(Number(from.version), Number(existing.version)) + 1,
            winner.updated_at,
          ],
        );
        await tx.query(
          "DELETE FROM saved_items WHERE user_id=$1 AND opportunity_id=$2",
          [userId, duplicateId],
        );
      }
      movedTrackerItems++;
    }

    const nextDuplicateRevision = duplicateRevision + 1,
      nextTargetRevision = targetRevision + 1,
      sourceURL = String(duplicate.source_url),
      duplicateNote = `${marker} Merged into opportunity ${targetId}. Source URL: ${sourceURL}. Reason: ${value.note}`,
      targetNote = `${marker} Merged duplicate ${duplicateId}. Source URL: ${sourceURL}. Reason: ${value.note}`;
    await tx.query(
      "UPDATE opportunities SET revision=$2,state='archived',verified_at=NULL,updated_at=NOW() WHERE id=$1",
      [duplicateId, nextDuplicateRevision],
    );
    await tx.query(
      "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES($1,$2,'archived',$3,$4,$5,$6)",
      [
        duplicateId,
        nextDuplicateRevision,
        JSON.stringify(duplicate.details),
        JSON.stringify(duplicate.evidence),
        actorId,
        duplicateNote,
      ],
    );
    await tx.query(
      "UPDATE opportunities SET revision=$2,updated_at=NOW() WHERE id=$1",
      [targetId, nextTargetRevision],
    );
    await tx.query(
      "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        targetId,
        nextTargetRevision,
        target.state,
        JSON.stringify(target.details),
        JSON.stringify(target.evidence),
        actorId,
        targetNote,
      ],
    );
    return {
      duplicateOpportunityId: duplicateId,
      targetOpportunityId: targetId,
      duplicateRevision: nextDuplicateRevision,
      targetRevision: nextTargetRevision,
      movedTrackerItems,
      merged: true,
      alreadyMerged: false,
    };
  });
}

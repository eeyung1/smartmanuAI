import { createHash } from "node:crypto";
import type { SQL } from "../db";
import { CatalogueError } from "../catalogue/service";

export class AnonymizationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AnonymizationError";
  }
}

const reference = (kind: string, value: string) =>
  createHash("sha256").update(`smartmanu:${kind}:v1:${value}`).digest("hex");

export function anonymizedReviewerId(userId: string) {
  return `anonymized-reviewer-${reference("reviewer", userId).slice(0, 24)}`;
}

type AuditMetadata = {
  type: "reviewer_anonymization";
  version: 1;
  targetReference: string;
  operatorReference: string;
  reason: string;
  anonymizedAt: string;
};

function parseAudit(value: unknown): AuditMetadata | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<AuditMetadata>;
    return parsed.type === "reviewer_anonymization" &&
      parsed.version === 1 &&
      typeof parsed.targetReference === "string" &&
      typeof parsed.operatorReference === "string" &&
      typeof parsed.reason === "string" &&
      typeof parsed.anonymizedAt === "string"
      ? (parsed as AuditMetadata)
      : null;
  } catch {
    return null;
  }
}

/**
 * Reassigns shared audit authorship while leaving the target's private account
 * intact for the ordinary deletion-request and purge workflow.
 */
export async function anonymizeReviewerContributions(
  sql: SQL,
  operatorId: string,
  targetUserId: string,
  reason: string,
) {
  const justification = reason.trim().replace(/\s+/g, " ");
  if (justification.length < 10 || justification.length > 1000)
    throw new AnonymizationError(
      400,
      "An anonymization justification between 10 and 1000 characters is required.",
    );
  const pseudonymId = anonymizedReviewerId(targetUserId);
  if (pseudonymId === operatorId)
    throw new AnonymizationError(400, "Invalid anonymization identities.");

  return sql.transaction(async (tx) => {
    const users = (
      await tx.query(
        "SELECT id FROM auth_user WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",
        [[...new Set([operatorId, targetUserId])]],
      )
    ).rows.map((row) => String(row.id));
    if (!users.includes(operatorId))
      throw new CatalogueError(403, "Administrator access required.");
    if (!users.includes(targetUserId))
      throw new CatalogueError(404, "Account not found.");
    if (
      !(
        await tx.query("SELECT user_id FROM admin_roles WHERE user_id=$1", [
          operatorId,
        ])
      ).rows.length
    )
      throw new CatalogueError(403, "Administrator access required.");

    const targetReference = reference("target", targetUserId);
    const operatorReference = reference("operator", operatorId);
    const existing = (
      await tx.query(
        "SELECT id,email,image,created_at FROM auth_user WHERE id=$1",
        [pseudonymId],
      )
    ).rows[0];
    let audit = parseAudit(existing?.image);
    if (
      existing &&
      (!audit ||
        audit.targetReference !== targetReference ||
        audit.operatorReference !== operatorReference ||
        audit.reason !== justification ||
        String(existing.email) !== `${pseudonymId}@redacted.invalid`)
    )
      throw new AnonymizationError(
        409,
        "An anonymization audit record already exists with different metadata.",
      );
    if (!existing) {
      audit = {
        type: "reviewer_anonymization",
        version: 1,
        targetReference,
        operatorReference,
        reason: justification,
        anonymizedAt: new Date().toISOString(),
      };
      await tx.query(
        `INSERT INTO auth_user(id,name,email,email_verified,image,created_at,updated_at)
         VALUES($1,'Anonymized reviewer',$2,false,$3,NOW(),NOW())`,
        [pseudonymId, `${pseudonymId}@redacted.invalid`, JSON.stringify(audit)],
      );
    }

    const sources = (
      await tx.query(
        "UPDATE sources SET created_by=$2 WHERE created_by=$1 RETURNING id",
        [targetUserId, pseudonymId],
      )
    ).rows.length;
    const revisions = (
      await tx.query(
        "UPDATE opportunity_revisions SET actor_id=$2 WHERE actor_id=$1 RETURNING opportunity_id",
        [targetUserId, pseudonymId],
      )
    ).rows.length;
    const policies = (
      await tx.query(
        "UPDATE source_collection_policies SET actor_id=$2 WHERE actor_id=$1 RETURNING source_id",
        [targetUserId, pseudonymId],
      )
    ).rows.length;
    const jobActions = (
      await tx.query(
        "UPDATE research_job_actions SET actor_id=$2 WHERE actor_id=$1 RETURNING id",
        [targetUserId, pseudonymId],
      )
    ).rows.length;

    return {
      pseudonymId,
      alreadyRecorded: existing !== undefined,
      audit: {
        type: audit!.type,
        version: audit!.version,
        targetReference: audit!.targetReference,
        operatorReference: audit!.operatorReference,
        reason: audit!.reason,
        anonymizedAt: audit!.anonymizedAt,
      },
      reassigned: { sources, revisions, policies, jobActions },
    };
  });
}

import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError, requireAdmin } from "./service";
import { sourceTypes, sourceLanguages } from "./source-fields";
export const sourceMetadataSchema = z
  .object({
    sourceId: z.uuid(),
    expectedVersion: z.number().int().min(1),
    sourceType: z.enum(sourceTypes),
    sourceLanguage: z.enum(sourceLanguages),
  })
  .strict();
export async function updateSourceMetadata(
  sql: SQL,
  actor: string,
  input: unknown,
) {
  await requireAdmin(sql, actor);
  const v = sourceMetadataSchema.parse(input);
  const updated = (
    await sql.query(
      "UPDATE sources SET source_type=$3,source_language=$4,metadata_version=metadata_version+1 WHERE id=$1 AND metadata_version=$2 RETURNING id,source_type,source_language,metadata_version",
      [v.sourceId, v.expectedVersion, v.sourceType, v.sourceLanguage],
    )
  ).rows[0];
  if (!updated) {
    if (
      !(await sql.query("SELECT id FROM sources WHERE id=$1", [v.sourceId]))
        .rows.length
    )
      throw new CatalogueError(404, "Source not found.");
    throw new CatalogueError(
      409,
      "Source metadata changed. Reload before saving.",
    );
  }
  return {
    id: String(updated.id),
    sourceType: String(updated.source_type),
    sourceLanguage: String(updated.source_language),
    metadataVersion: Number(updated.metadata_version),
  };
}

import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError, requireAdmin, reviewOpportunity } from "./service";
export const bulkArchiveSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            expectedRevision: z.number().int().min(1).max(2147483646),
          })
          .strict(),
      )
      .min(1)
      .max(25),
    note: z.string().trim().min(5).max(1000),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.id)).size === value.items.length,
    "Choose each record only once.",
  );
export type BulkArchiveItem =
  | { id: string; outcome: "archived"; revision: number }
  | {
      id: string;
      outcome: "skipped";
      reason: "conflict" | "not_found" | "ineligible" | "permission_lost";
    }
  | { id: string; outcome: "unknown" }
  | { id: string; outcome: "not_attempted" };
export type BulkArchiveResult = {
  results: BulkArchiveItem[];
  stoppedEarly: boolean;
};
/** Each record commits independently through the existing audited lifecycle transition. */
export async function bulkArchive(
  sql: SQL,
  actor: string,
  input: unknown,
): Promise<BulkArchiveResult> {
  await requireAdmin(sql, actor);
  const value = bulkArchiveSchema.parse(input),
    results: BulkArchiveItem[] = [];
  let stoppedEarly = false;
  for (const item of value.items) {
    if (stoppedEarly) {
      results.push({ id: item.id, outcome: "not_attempted" });
      continue;
    }
    try {
      const updated = await reviewOpportunity(sql, actor, item.id, {
        action: "archive",
        expectedRevision: item.expectedRevision,
        note: value.note,
      });
      results.push({
        id: item.id,
        outcome: "archived",
        revision: updated.revision,
      });
    } catch (error) {
      if (
        error instanceof CatalogueError &&
        [400, 403, 404, 409].includes(error.status)
      ) {
        const reason =
          error.status === 409
            ? "conflict"
            : error.status === 404
              ? "not_found"
              : error.status === 403
                ? "permission_lost"
                : "ineligible";
        results.push({ id: item.id, outcome: "skipped", reason });
        if (error.status === 403) stoppedEarly = true;
      } else {
        results.push({ id: item.id, outcome: "unknown" });
        stoppedEarly = true;
      }
    }
  }
  return { results, stoppedEarly };
}

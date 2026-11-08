import { z } from "zod";
import type { SQL } from "../db";
import { CatalogueError, requireAdmin } from "../catalogue/service";
export const hostDelaySchema = z
  .object({
    sourceId: z.uuid(),
    expectedVersion: z.number().int().min(0).max(2147483646),
    requestDelaySeconds: z.number().int().min(0).max(3600),
  })
  .strict();
export async function saveHostDelay(sql: SQL, actor: string, input: unknown) {
  await requireAdmin(sql, actor);
  const value = hostDelaySchema.parse(input);
  return sql.transaction(async (tx) => {
    const source = (
      await tx.query("SELECT collection_host FROM sources WHERE id=$1", [
        value.sourceId,
      ])
    ).rows[0];
    if (!source) throw new CatalogueError(404, "Source not found.");
    const saved =
      value.expectedVersion === 0
        ? (
            await tx.query(
              "INSERT INTO collection_host_locks(hostname,request_delay_seconds) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING hostname,request_delay_seconds,version",
              [source.collection_host, value.requestDelaySeconds],
            )
          ).rows[0]
        : (
            await tx.query(
              "UPDATE collection_host_locks SET request_delay_seconds=$3,version=version+1 WHERE hostname=$1 AND version=$2 RETURNING hostname,request_delay_seconds,version",
              [
                source.collection_host,
                value.expectedVersion,
                value.requestDelaySeconds,
              ],
            )
          ).rows[0];
    if (!saved)
      throw new CatalogueError(
        409,
        "Host settings changed. Reload before saving.",
      );
    return {
      hostname: String(saved.hostname),
      requestDelaySeconds: Number(saved.request_delay_seconds),
      version: Number(saved.version),
    };
  });
}

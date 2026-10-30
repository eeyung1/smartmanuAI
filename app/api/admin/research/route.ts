import { z } from "zod";
import { adminAccess, apiError, readJSON } from "@/src/http/access";
import { collectionPolicy, researchDashboard } from "@/src/research/collection";
import { applyExtraction } from "@/src/research/extraction";
export async function GET(request: Request) {
  try {
    const { sql, userId } = await adminAccess(request);
    return Response.json(await researchDashboard(sql, userId));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { sql, userId } = await adminAccess(request, true);
    const body = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("policy"),
          sourceId: z.uuid(),
          enabled: z.boolean(),
          permissionNote: z.string(),
        }),
        z.object({
          action: z.literal("extract"),
          candidateId: z.uuid(),
          extraction: z.unknown(),
        }),
      ])
      .parse(await readJSON(request));
    if (body.action === "policy") {
      const { action, ...policy } = body;
      return Response.json(await collectionPolicy(sql, userId, policy));
    }
    return Response.json(
      await applyExtraction(sql, userId, body.candidateId, body.extraction),
    );
  } catch (e) {
    return apiError(e);
  }
}

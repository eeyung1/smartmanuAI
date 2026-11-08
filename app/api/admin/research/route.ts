import { z } from "zod";
import { adminAccess, apiError, readJSON } from "@/src/http/access";
import { collectionPolicy } from "@/src/research/collection";
import { queryFields } from "@/src/catalogue/admin-browse";
import {
  selectedResearchData,
  researchSelectionSchema,
} from "@/src/research/browse";
import { applyExtraction } from "@/src/research/extraction";
export async function GET(request: Request) {
  let response: Response;
  try {
    const { sql, userId } = await adminAccess(request);
    const selected = await selectedResearchData(
      sql,
      userId,
      researchSelectionSchema.parse(
        queryFields(new URL(request.url).searchParams),
      ),
    );
    response = Response.json(selected.data);
  } catch (error) {
    response = apiError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
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
          cadenceHours: z.number().int().min(6).max(168).optional(),
          scheduleMode: z.enum(["fixed", "deadline_aware"]).optional(),
          requestDelaySeconds: z.number().int().min(0).max(3600).optional(),
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

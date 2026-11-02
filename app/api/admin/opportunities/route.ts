import { createDraft } from "@/src/catalogue/service";
import {
  editorQuerySchema,
  queryFields,
  reviewEditorData,
} from "@/src/catalogue/admin-browse";
import { adminAccess, apiError, readJSON } from "@/src/http/access";
export async function GET(request: Request) {
  let response: Response;
  try {
    const { sql, userId } = await adminAccess(request);
    const data = await reviewEditorData(
      sql,
      userId,
      editorQuerySchema.parse(queryFields(new URL(request.url).searchParams)),
    );
    response = Response.json({
      sources: data.sources,
      opportunities: data.opportunities,
    });
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
    return Response.json(
      await createDraft(sql, userId, await readJSON(request)),
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}

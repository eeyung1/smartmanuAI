import { adminAccess, apiError, readJSON } from "@/src/http/access";
import { collectionJob, actOnCollectionJob } from "@/src/research/jobs";
type Context = { params: Promise<{ id: string }> };
function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export async function GET(request: Request, context: Context) {
  try {
    const { sql, userId } = await adminAccess(request);
    return privateResponse(
      Response.json(
        await collectionJob(sql, userId, (await context.params).id),
      ),
    );
  } catch (error) {
    return privateResponse(apiError(error));
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { sql, userId } = await adminAccess(request, true);
    return privateResponse(
      Response.json(
        await actOnCollectionJob(
          sql,
          userId,
          (await context.params).id,
          await readJSON(request),
        ),
      ),
    );
  } catch (error) {
    return privateResponse(apiError(error));
  }
}

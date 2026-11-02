import { browseResearch, parseResearchBrowse } from "@/src/research/browse";
import { adminAccess, apiError } from "@/src/http/access";
export async function GET(request: Request) {
  let response: Response;
  try {
    const { sql, userId } = await adminAccess(request);
    response = Response.json(
      await browseResearch(
        sql,
        userId,
        parseResearchBrowse(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    response = apiError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

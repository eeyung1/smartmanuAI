import { adminAccess, apiError, readJSON } from "@/src/http/access";
import { saveHostDelay } from "@/src/research/host-delay";
export async function PATCH(request: Request) {
  let response: Response;
  try {
    const { sql, userId } = await adminAccess(request, true);
    response = Response.json(
      await saveHostDelay(sql, userId, await readJSON(request)),
    );
  } catch (error) {
    response = apiError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

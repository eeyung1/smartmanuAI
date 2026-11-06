import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { localConfig } from "@/src/config";
import { CatalogueError } from "@/src/catalogue/service";
import { apiError, readJSON } from "@/src/http/access";
import { listAccountSessions, revokeAccountSession } from "@/src/auth/sessions";
export const dynamic = "force-dynamic";
async function actor(request: Request) {
  const value = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!value) throw new CatalogueError(401, "Sign in required.");
  return { userId: value.user.id, sessionId: value.session.id };
}
function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export async function GET(request: Request) {
  try {
    const owner = await actor(request),
      params = new URL(request.url).searchParams;
    if (params.getAll("page").length > 1)
      throw new SyntaxError("Duplicate page");
    return privateResponse(
      Response.json(
        await listAccountSessions(
          (await getDatabase()).sql,
          owner,
          Object.fromEntries(params),
        ),
      ),
    );
  } catch (error) {
    return privateResponse(apiError(error));
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== localConfig().baseURL)
      throw new CatalogueError(403, "Invalid request origin.");
    const owner = await actor(request);
    return privateResponse(
      Response.json(
        await revokeAccountSession(
          (await getDatabase()).sql,
          owner,
          await readJSON(request),
        ),
      ),
    );
  } catch (error) {
    return privateResponse(apiError(error));
  }
}

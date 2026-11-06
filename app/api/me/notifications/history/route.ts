import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { browseDigestHistory } from "@/src/jobs/digest-history";
import { apiError } from "@/src/http/access";
export const dynamic = "force-dynamic";
function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export async function GET(request: Request) {
  try {
    const session = await (
      await getAuth()
    ).api.getSession({ headers: request.headers });
    if (!session)
      return privateResponse(
        Response.json({ error: "unauthorized" }, { status: 401 }),
      );
    const params = new URL(request.url).searchParams;
    const query: Record<string, unknown> = Object.create(null);
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key);
      query[key] = values.length === 1 ? values[0] : values;
    }
    return privateResponse(
      Response.json(
        await browseDigestHistory(
          (await getDatabase()).sql,
          session.user.id,
          query,
        ),
      ),
    );
  } catch (error) {
    return privateResponse(apiError(error));
  }
}

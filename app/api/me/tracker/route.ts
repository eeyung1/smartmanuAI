import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { listTracker, updateTracker } from "@/src/domain/tracker";
import { apiError, readJSON } from "@/src/http/access";
import { localConfig } from "@/src/config";
export async function GET(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(
    await listTracker((await getDatabase()).sql, session.user.id),
  );
}
export async function PATCH(request: Request) {
  if (request.headers.get("origin") !== localConfig().baseURL)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(
      await updateTracker(
        (await getDatabase()).sql,
        session.user.id,
        await readJSON(request),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}

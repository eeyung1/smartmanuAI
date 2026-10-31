import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import {
  readNotificationSettings,
  saveNotificationSettings,
  digestHistory,
} from "@/src/jobs/digests";
import { localConfig } from "@/src/config";
import { apiError, readJSON } from "@/src/http/access";
export async function GET(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  const { sql } = await getDatabase();
  return Response.json({
    settings: await readNotificationSettings(sql, session.user.id),
    history: await digestHistory(sql, session.user.id),
  });
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
      await saveNotificationSettings(
        (await getDatabase()).sql,
        session.user.id,
        await readJSON(request),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}

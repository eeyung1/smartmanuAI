import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { readProfile, saveProfile } from "@/src/domain/profile";
import { localConfig } from "@/src/config";
export async function GET(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(
    await readProfile((await getDatabase()).sql, session.user.id),
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
      await saveProfile(
        (await getDatabase()).sql,
        session.user.id,
        await request.json(),
      ),
    );
  } catch {
    return Response.json({ error: "invalid_profile" }, { status: 400 });
  }
}

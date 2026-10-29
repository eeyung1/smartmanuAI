import { z } from "zod";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { listSaved, saveItem } from "@/src/domain/profile";
import { localConfig } from "@/src/config";
export async function GET(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(
    await listSaved((await getDatabase()).sql, session.user.id),
  );
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== localConfig().baseURL)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { opportunityId: "synthetic-course" };
  try {
    body = z
      .object({ opportunityId: z.literal("synthetic-course") })
      .strict()
      .parse(await request.json());
  } catch {
    return Response.json({ error: "invalid_opportunity" }, { status: 400 });
  }
  await saveItem(
    (await getDatabase()).sql,
    session.user.id,
    body.opportunityId,
  );
  return Response.json({ saved: true });
}

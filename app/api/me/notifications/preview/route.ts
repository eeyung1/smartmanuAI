import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { buildUpcomingDigestPreview } from "@/src/jobs/digest-preview";

export async function GET(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({
    headers: request.headers,
  });
  if (!session)
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const preview = await buildUpcomingDigestPreview(
    (await getDatabase()).sql,
    session.user.id,
  );
  return Response.json(preview, { headers: { "Cache-Control": "no-store" } });
}

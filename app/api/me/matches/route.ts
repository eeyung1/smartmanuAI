import { z } from "zod";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { matchesForUser } from "@/src/domain/matching";
import { apiError } from "@/src/http/access";
export async function GET(request: Request) {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const query = z
      .object({ page: z.coerce.number().int().min(1).max(1000).default(1) })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(
      await matchesForUser(
        (await getDatabase()).sql,
        session.user.id,
        query.page,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}

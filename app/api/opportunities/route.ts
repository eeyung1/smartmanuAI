import { getDatabase } from "@/src/db";
import { listPublic } from "@/src/catalogue/service";
import { parseFilters } from "@/src/catalogue/schema";
import { apiError } from "@/src/http/access";
export async function GET(request: Request) {
  try {
    return Response.json(
      await listPublic(
        (await getDatabase()).sql,
        parseFilters(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}

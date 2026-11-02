import { getDatabase } from "@/src/db";
import { listPublic } from "@/src/catalogue/service";
import { parseSearchFilters } from "@/src/catalogue/schema";
import { apiError } from "@/src/http/access";
export async function GET(request: Request) {
  try {
    return Response.json(
      await listPublic(
        (await getDatabase()).sql,
        parseSearchFilters(new URL(request.url).searchParams),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}

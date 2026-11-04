import { adminAccess, apiError, readJSON } from "@/src/http/access";
import { mergeDuplicateOpportunity } from "@/src/domain/catalogue-merge";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { sql, userId } = await adminAccess(request, true);
    return Response.json(
      await mergeDuplicateOpportunity(
        sql,
        userId,
        (await params).id,
        await readJSON(request),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

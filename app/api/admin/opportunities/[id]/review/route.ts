import { reviewOpportunity, revisionHistory } from "@/src/catalogue/service";
import { adminAccess, apiError, readJSON } from "@/src/http/access";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { sql, userId } = await adminAccess(request);
    return Response.json(await revisionHistory(sql, userId, (await params).id));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { sql, userId } = await adminAccess(request, true);
    return Response.json(
      await reviewOpportunity(
        sql,
        userId,
        (await params).id,
        await readJSON(request),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}

import { createDraft, adminCatalogue } from "@/src/catalogue/service";
import { adminAccess, apiError, readJSON } from "@/src/http/access";
export async function GET(request: Request) {
  try {
    const { sql, userId } = await adminAccess(request);
    return Response.json(await adminCatalogue(sql, userId));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { sql, userId } = await adminAccess(request, true);
    return Response.json(
      await createDraft(sql, userId, await readJSON(request)),
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}

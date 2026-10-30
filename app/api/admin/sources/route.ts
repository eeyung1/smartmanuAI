import { createSource } from "@/src/catalogue/service";
import { adminAccess, apiError, readJSON } from "@/src/http/access";
export async function POST(request: Request) {
  try {
    const { sql, userId } = await adminAccess(request, true);
    return Response.json(
      await createSource(sql, userId, await readJSON(request)),
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}

import { updateSourceMetadata } from "@/src/catalogue/source-metadata";
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

export async function PATCH(request: Request) {
  try {
    const { sql, userId } = await adminAccess(request, true);
    return Response.json(
      await updateSourceMetadata(sql, userId, await readJSON(request)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

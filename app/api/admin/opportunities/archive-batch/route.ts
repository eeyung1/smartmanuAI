import { adminAccess, apiError, readJSON } from "@/src/http/access";
import { bulkArchive } from "@/src/catalogue/bulk-archive";
export async function POST(request: Request) {
  let response: Response;
  try {
    const { sql, userId } = await adminAccess(request, true);
    response = Response.json(
      await bulkArchive(sql, userId, await readJSON(request)),
    );
  } catch (error) {
    response = apiError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

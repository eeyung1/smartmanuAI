import { browseAdmin, parseAdminBrowse } from "@/src/catalogue/admin-browse";
import { adminAccess, apiError } from "@/src/http/access";
export async function GET(request: Request) {
  let response: Response;
  try {
    const { sql, userId } = await adminAccess(request);
    response = Response.json(
      await browseAdmin(
        sql,
        userId,
        parseAdminBrowse(new URL(request.url).searchParams),
      ),
    );
  } catch (error) {
    response = apiError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

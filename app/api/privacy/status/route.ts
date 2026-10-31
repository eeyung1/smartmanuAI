import { getDatabase } from "@/src/db";
import { deletionStatus } from "@/src/privacy/account";
import { apiError } from "@/src/http/access";
export async function GET(request: Request) {
  try {
    return Response.json(
      await deletionStatus(
        (await getDatabase()).sql,
        new URL(request.url).searchParams.get("receipt") ?? "",
      ),
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}

import { auditHistory, parseHistoryQuery } from "@/src/catalogue/history";
import { adminAccess, apiError } from "@/src/http/access";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { sql, userId } = await adminAccess(request);
    return Response.json(
      await auditHistory(
        sql,
        userId,
        (await params).id,
        parseHistoryQuery(new URL(request.url).searchParams),
      ),
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
}

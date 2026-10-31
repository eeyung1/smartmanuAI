import { getDatabase } from "@/src/db";
import { privacyOwner } from "@/src/privacy/access";
import { requestAccountDeletion } from "@/src/privacy/account";
import { apiError, readJSON } from "@/src/http/access";
export async function POST(request: Request) {
  try {
    const userId = await privacyOwner(request, true);
    return Response.json(
      await requestAccountDeletion(
        (await getDatabase()).sql,
        userId,
        await readJSON(request),
      ),
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}

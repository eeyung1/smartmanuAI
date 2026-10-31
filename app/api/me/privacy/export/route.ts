import { z } from "zod";
import { getDatabase } from "@/src/db";
import { privacyOwner } from "@/src/privacy/access";
import { accountExport } from "@/src/privacy/account";
import { apiError } from "@/src/http/access";
export async function GET(request: Request) {
  try {
    const userId = await privacyOwner(request);
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(
      await accountExport((await getDatabase()).sql, userId),
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition":
            'attachment; filename="smartmanuAI-account.json"',
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}

import { liveEmailAccess } from "@/src/email/access";
import { liveEmailSettings, saveLiveEmailSettings } from "@/src/email/settings";
import { apiError, readJSON } from "@/src/http/access";
export async function GET(request: Request) {
  try {
    const a = await liveEmailAccess(request);
    return Response.json(await liveEmailSettings(a.sql, a.userId, a.config), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const a = await liveEmailAccess(request, true);
    return Response.json(
      await saveLiveEmailSettings(
        a.sql,
        a.userId,
        await readJSON(request),
        a.config,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}

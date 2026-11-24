import { liveEmailAccess } from "@/src/email/access";
import { queueLiveEmail, dispatchLiveEmail } from "@/src/email/worker";
import { apiError } from "@/src/http/access";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const a = await liveEmailAccess(request, true);
    const id = await queueLiveEmail(a.sql, a.userId, a.config, "test");
    return Response.json({
      state: id ? await dispatchLiveEmail(a.sql, id, a.config) : "not_pending",
    });
  } catch (e) {
    return apiError(e);
  }
}

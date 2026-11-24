import { liveEmailConfig, requireBearer } from "@/src/email/config";
import { runLiveEmailCycle } from "@/src/email/worker";
import { getDatabase } from "@/src/db";
import { apiError } from "@/src/http/access";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const config = liveEmailConfig();
    requireBearer(request.headers, config.cronSecret);
    const result = await runLiveEmailCycle((await getDatabase()).sql, config);
    console.info("live_email_cycle", result);
    return Response.json(result);
  } catch (e) {
    return apiError(e);
  }
}

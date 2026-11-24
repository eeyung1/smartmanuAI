import { brevoCallbackConfig, requireBearer } from "@/src/email/config";
import { processBrevoAlertWebhook } from "@/src/email/webhook";
import { getDatabase } from "@/src/db";
import { apiError, readJSON } from "@/src/http/access";
import { CatalogueError } from "@/src/catalogue/service";
export async function POST(request: Request) {
  try {
    const config = brevoCallbackConfig();
    requireBearer(request.headers, config.webhookSecret);
    const input = await readJSON(request),
      events = Array.isArray(input) ? input : [input];
    if (events.length > 20)
      throw new CatalogueError(413, "Request is too large.");
    const { sql } = await getDatabase();
    for (const event of events)
      await processBrevoAlertWebhook(sql, event, config);
    return Response.json({ received: true });
  } catch (e) {
    return apiError(e);
  }
}

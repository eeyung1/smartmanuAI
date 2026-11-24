import { liveEmailAccess } from "@/src/email/access";
import { registerBrevoAlertWebhook } from "@/src/email/provider";
import { CatalogueError } from "@/src/catalogue/service";
import { apiError } from "@/src/http/access";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const a = await liveEmailAccess(request, true);
    if (a.email.toLowerCase() !== a.config.operator)
      throw new CatalogueError(403, "Operator access required.");
    return Response.json(await registerBrevoAlertWebhook(a.sql, a.config));
  } catch (e) {
    return apiError(e);
  }
}

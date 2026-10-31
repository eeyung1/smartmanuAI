import { getDatabase } from "@/src/db";
import {
  emailControlsConfig,
  verifyEmailWebhook,
  processEmailWebhook,
} from "@/src/channels/email-controls";
import { apiError, readBody } from "@/src/http/access";
export async function POST(request: Request) {
  try {
    const config = emailControlsConfig(),
      raw = await readBody(request),
      event = verifyEmailWebhook(raw, request.headers, config);
    await processEmailWebhook(
      (await getDatabase()).sql,
      event.id,
      event.payload,
      config,
    );
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

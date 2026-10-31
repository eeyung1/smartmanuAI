import { getDatabase } from "@/src/db";
import {
  telegramConfig,
  authenticateTelegram,
  handleTelegramUpdate,
} from "@/src/channels/telegram";
import { apiError, readJSON } from "@/src/http/access";
export async function POST(request: Request) {
  try {
    const config = telegramConfig();
    authenticateTelegram(
      request.headers.get("x-telegram-bot-api-secret-token"),
      config,
    );
    await handleTelegramUpdate(
      (await getDatabase()).sql,
      await readJSON(request),
      config,
    );
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

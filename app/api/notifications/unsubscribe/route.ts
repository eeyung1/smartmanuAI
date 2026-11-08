import { localeFromCookie } from "@/src/i18n/locale";
import { screenText } from "@/src/i18n/screens";
import { getDatabase } from "@/src/db";
import {
  emailControlsConfig,
  unsubscribeEmail,
} from "@/src/channels/email-controls";
import { apiError } from "@/src/http/access";
import { parseUnsubscribeRequest } from "@/src/channels/unsubscribe-request";
export async function POST(request: Request) {
  try {
    const { token, oneClick } = await parseUnsubscribeRequest(request);
    await unsubscribeEmail(
      (await getDatabase()).sql,
      token,
      emailControlsConfig(),
    );
    const locale = oneClick
      ? "en"
      : (localeFromCookie(request.headers.get("cookie")) ?? "en");
    return new Response(
      screenText(locale, "Email digest unsubscribe request processed."),
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Language": locale,
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}

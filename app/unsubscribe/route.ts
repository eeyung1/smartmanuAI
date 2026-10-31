import { localeFromCookie } from "@/src/i18n/locale";
import { screenText } from "@/src/i18n/screens";
export async function GET(request: Request) {
  const locale = localeFromCookie(request.headers.get("cookie")) ?? "en";
  const t = (key: string) => screenText(locale, key);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const valid = /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token);
  return new Response(
    `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t("Email digest preferences")}</title><body><main><h1>${t("Pause email digests")}</h1><p>${t("Opening this page does not change your settings. Confirm below to pause the email consent version associated with this link. It will not pause Telegram or authentication messages.")}</p>${valid ? `<form method="post" action="/api/notifications/unsubscribe"><input type="hidden" name="token" value="${token}"><input type="hidden" name="confirm" value="unsubscribe"><button type="submit">${t("Pause email digests")}</button></form>` : `<p>${t("This link is invalid. Sign in to manage your notification settings.")}</p>`}<p>${t("Local prototype. No real email provider is connected.")}</p></main></body></html>`,
    {
      status: valid ? 200 : 400,
      headers: {
        "Content-Language": locale,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex,nofollow",
        "Content-Security-Policy":
          "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}

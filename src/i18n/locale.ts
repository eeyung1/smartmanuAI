export const locales = ["en", "zh-Hans"] as const;
export type Locale = (typeof locales)[number];
export const LOCALE_COOKIE = "smartmanu_locale";
export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-Hans";
}
export function resolveAlertLanguage(requested: unknown) {
  return {
    language: isLocale(requested) ? requested : ("en" as const),
    requestedLanguage: typeof requested === "string" ? requested : "en",
    translationFallback: !isLocale(requested),
  };
}
export function localeCookie(locale: Locale) {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
}

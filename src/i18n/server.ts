import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getAuth } from "../auth";
import { getDatabase } from "../db";
import { readProfile } from "../domain/profile";
import { LOCALE_COOKIE, isLocale, type Locale } from "./locale";
export const interfaceLocale = cache(async (): Promise<Locale> => {
  const selected = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(selected)) return selected;
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) return "en";
  const profile = await readProfile((await getDatabase()).sql, session.user.id);
  return profile?.interfaceLanguage ?? "en";
});

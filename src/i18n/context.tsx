"use client";
import { createContext, useContext } from "react";
import type { Locale } from "./locale";
import {
  screenText,
  screenLabel,
  matchExplanation,
  screenMessage,
  researchState,
} from "./screens";
const Context = createContext<Locale>("en");
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <Context.Provider value={locale}>{children}</Context.Provider>;
}
export function useScreenText() {
  const locale = useContext(Context);
  return {
    locale,
    t: (key: string, values?: Record<string, string | number>) =>
      screenText(locale, key, values),
    label: (value: string) => screenLabel(locale, value),
    reason: (value: string) => matchExplanation(locale, value),
    research: (kind: "job" | "candidate", value: string) =>
      researchState(locale, kind, value),
    message: (value: string) => screenMessage(locale, value),
  };
}

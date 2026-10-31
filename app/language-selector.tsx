"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { interfaceCopy } from "@/src/i18n/copy";
import type { Locale } from "@/src/i18n/locale";
export default function LanguageSelector({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const copy = interfaceCopy(locale);
  return (
    <form
      className="language-picker"
      onSubmit={async (event) => {
        event.preventDefault();
        const selected = new FormData(event.currentTarget).get("locale");
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/locale", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale: selected }),
          });
          if (!response.ok) throw Error(copy.localeError);
          router.refresh();
        } catch {
          setError(copy.localeError);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {copy.displayLanguage}
        <select
          key={locale}
          name="locale"
          defaultValue={locale}
          disabled={busy}
        >
          <option value="en" lang="en">
            English
          </option>
          <option value="zh-Hans" lang="zh-Hans">
            简体中文
          </option>
        </select>
      </label>
      <button disabled={busy}>{busy ? copy.saving : copy.apply}</button>
      <span role="status">{error}</span>
    </form>
  );
}

"use client";
import { useState } from "react";
import type { Preferences } from "@/src/domain/profile";
export default function Workspace({
  profile,
  saved,
}: {
  profile: Preferences | null;
  saved: unknown[];
}) {
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState(saved);
  const [stored, setStored] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [interfaceLanguage, setInterfaceLanguage] = useState(
    profile?.interfaceLanguage ?? "en",
  );
  const [alertLanguage, setAlertLanguage] = useState(
    profile?.alertLanguage ?? "en",
  );
  const [teachingLanguage, setTeachingLanguage] = useState(
    profile?.teachingLanguages[0] ?? "en",
  );
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch {
      setNotice("Connection failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form">
      <h2>Local validation controls</h2>
      <p>
        Language choices here are test settings, not a completed translated
        interface.
      </p>
      <label htmlFor="interface-language">Interface language</label>
      <select
        id="interface-language"
        value={interfaceLanguage}
        onChange={(e) =>
          setInterfaceLanguage(
            e.target.value as Preferences["interfaceLanguage"],
          )
        }
      >
        <option value="en">English</option>
        <option value="zh-Hans">Simplified Chinese</option>
      </select>
      <label htmlFor="alert-language">Alert language</label>
      <select
        id="alert-language"
        value={alertLanguage}
        onChange={(e) =>
          setAlertLanguage(e.target.value as Preferences["alertLanguage"])
        }
      >
        <option value="en">English</option>
        <option value="zh-Hans">Simplified Chinese</option>
      </select>
      <label htmlFor="teaching-language">Teaching language</label>
      <select
        id="teaching-language"
        value={teachingLanguage}
        onChange={(e) => setTeachingLanguage(e.target.value as "en" | "zh")}
      >
        <option value="en">English</option>
        <option value="zh">Chinese</option>
      </select>
      <button
        disabled={busy}
        onClick={() =>
          action(async () => {
            const r = await fetch("/api/me/profile", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                interfaceLanguage,
                alertLanguage,
                teachingLanguages: [teachingLanguage],
                nationality: stored?.nationality ?? null,
              }),
            });
            if (r.ok) {
              setStored(await r.json());
              setNotice("Preferences saved.");
            } else setNotice("Unable to save preferences.");
          })
        }
      >
        Save preferences
      </button>
      <p>
        Stored preferences: <code>{JSON.stringify(stored)}</code>
      </p>
      <button
        disabled={busy}
        onClick={() =>
          action(async () => {
            const r = await fetch("/api/me/saved", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ opportunityId: "synthetic-course" }),
            });
            if (r.ok) {
              const list = await fetch("/api/me/saved");
              if (!list.ok) throw new Error();
              setItems(await list.json());
              setNotice("Fixture saved.");
            } else setNotice("Unable to save fixture.");
          })
        }
      >
        Save synthetic opportunity
      </button>
      <p>{items.length} saved opportunity</p>
      <button
        disabled={busy}
        onClick={() =>
          action(async () => {
            const r = await fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (r.ok) window.location.assign("/sign-in");
            else setNotice("Unable to sign out.");
          })
        }
      >
        Sign out
      </button>
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}

"use client";
import { useScreenText } from "@/src/i18n/context";
import { useState } from "react";
export default function DeliveryTests({
  initial,
}: {
  initial: {
    id: string;
    channel: string;
    state: string;
    attempts: number;
    error_code: string | null;
  }[];
}) {
  const { locale, t, label, message: translateMessage } = useScreenText();
  const [items, setItems] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function act(prepare: boolean) {
    setBusy(true);
    try {
      if (prepare) {
        const r = await fetch("/api/me/delivery-tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const value = await r.json();
        if (!r.ok)
          throw Error(value.error ?? "Unable to prepare a delivery test.");
      }
      const r = await fetch("/api/me/delivery-tests");
      if (!r.ok) throw Error("Unable to refresh local delivery tests.");
      setItems(await r.json());
      setMessage(
        prepare
          ? "Local test prepared. A separate fixture worker processes it; no real provider is contacted."
          : "Local test status refreshed.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section lang={locale}>
      <h2>{t("Outbound delivery simulation")}</h2>
      <p>
        {t(
          "Only synthetic digests are eligible. These tests use fake provider credentials and an injected fixture transport. No live sender is connected.",
        )}{" "}
      </p>
      <button disabled={busy} onClick={() => void act(true)}>
        {t("Prepare latest local digest for testing")}{" "}
      </button>
      <button
        disabled={busy}
        className="secondary"
        onClick={() => void act(false)}
      >
        {t("Refresh delivery tests")}{" "}
      </button>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {label(item.channel)} ·{" "}
              {item.state === "accepted"
                ? t("Fixture provider accepted")
                : label(item.state)}{" "}
              {t("· Attempts")} {item.attempts}
              {item.error_code
                ? " · " +
                  t("Diagnostic code: {code}", { code: item.error_code })
                : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("No outbound tests yet.")}</p>
      )}
      <p role="status">{translateMessage(message)}</p>
    </section>
  );
}

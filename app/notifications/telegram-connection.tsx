"use client";
import { useScreenText } from "@/src/i18n/context";
import { useState } from "react";
import type { telegramStatus } from "@/src/channels/telegram";
type Status = Awaited<ReturnType<typeof telegramStatus>>;
export default function TelegramConnection({
  initial,
  available,
}: {
  initial: Status;
  available: boolean;
}) {
  const { locale, t, label, message: translateMessage } = useScreenText();
  const [status, setStatus] = useState(initial),
    [code, setCode] = useState(""),
    [expires, setExpires] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function action(method: string, body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/me/telegram", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await r.json();
      if (!r.ok) throw Error(value.error ?? "Unable to update connection.");
      if (method === "POST") {
        setCode(value.startCommand);
        setExpires(value.expiresAt);
        setMessage(
          "Local test code created. It is single-use and expires in ten minutes.",
        );
      } else {
        setStatus(value);
        setCode("");
        setMessage(
          value.state === "active"
            ? "Local binding confirmed. Live delivery is still disconnected."
            : "Connection revoked and selected Telegram digests paused.",
        );
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form" lang={locale}>
      <h2>{t("Telegram connection test")}</h2>
      <p>
        {t(
          "This is a local test flow, not a live Telegram bot. A simulated private-chat webhook creates a pending binding; confirmation here is required. Linking never enables digests automatically.",
        )}{" "}
      </p>
      <p>
        {t("Status:")} {label(status.state)}
        {status.chatSuffix
          ? t(" · Chat ending {suffix}", { suffix: status.chatSuffix })
          : ""}
      </p>
      {!available ? (
        <p>{t("Connection tests are unavailable in this environment.")}</p>
      ) : (
        <div lang={locale}>
          <button disabled={busy} onClick={() => void action("POST", {})}>
            {t("Create local linking code")}{" "}
          </button>
          {code ? (
            <>
              <p>
                {t("Private test command:")} <code>{code}</code>
              </p>
              <p>
                {t("Expires:")} {expires}
                {t(". Keep this code private.")}
              </p>
            </>
          ) : null}
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await fetch("/api/me/telegram");
                if (!r.ok) throw Error("Unable to refresh connection.");
                setStatus(await r.json());
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Refresh connection status")}{" "}
          </button>
          {status.state === "pending" ? (
            <button
              disabled={busy}
              onClick={() =>
                void action("PATCH", {
                  action: "confirm",
                  expectedVersion: status.version,
                })
              }
            >
              {t("Confirm this local binding")}{" "}
            </button>
          ) : null}
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void action("PATCH", {
                action: "disconnect",
                expectedVersion: status.version,
              })
            }
          >
            {t("Disconnect and cancel linking codes")}{" "}
          </button>
        </div>
      )}
      <p role="status">{translateMessage(message)}</p>
    </section>
  );
}

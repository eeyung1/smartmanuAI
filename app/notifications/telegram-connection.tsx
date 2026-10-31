"use client";
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
    <section className="form">
      <h2>Telegram connection test</h2>
      <p>
        This is a local test flow, not a live Telegram bot. A simulated
        private-chat webhook creates a pending binding; confirmation here is
        required. Linking never enables digests automatically.
      </p>
      <p>
        Status: {status.state}
        {status.chatSuffix ? " · Chat ending " + status.chatSuffix : ""}
      </p>
      {!available ? (
        <p>Connection tests are unavailable in this environment.</p>
      ) : (
        <>
          <button disabled={busy} onClick={() => void action("POST", {})}>
            Create local linking code
          </button>
          {code ? (
            <>
              <p>
                Private test command: <code>{code}</code>
              </p>
              <p>Expires: {expires}. Keep this code private.</p>
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
            Refresh connection status
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
              Confirm this local binding
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
            Disconnect and cancel linking codes
          </button>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}

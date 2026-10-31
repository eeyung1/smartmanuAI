"use client";
import { useState } from "react";
import type { readNotificationSettings } from "@/src/jobs/digests";
type Settings = Awaited<ReturnType<typeof readNotificationSettings>>;
type History = { id: string; channel: string; slot: string; state: string }[];
export default function NotificationSettings({
  initial,
  initialHistory,
}: {
  initial: Settings;
  initialHistory: History;
}) {
  const [settings, setSettings] = useState(initial),
    [history, setHistory] = useState(initialHistory),
    [enabled, setEnabled] = useState(initial.enabled),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [testLink, setTestLink] = useState("");
  async function save(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await r.json();
      if (!r.ok)
        throw Error(value.error ?? "Unable to save notification settings.");
      setSettings(value);
      setEnabled(value.enabled);
      const refreshed = await fetch("/api/me/notifications");
      if (!refreshed.ok)
        throw Error(
          "Settings saved, but history could not refresh. Reload this page.",
        );
      setHistory((await refreshed.json()).history);
      setMessage(
        value.enabled
          ? "Local digest simulation enabled. No real messages will be sent."
          : "Digests paused. Pending digests have been cancelled.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="form">
        <h2>Digest settings</h2>
        {settings.emailSuppressionReason ? (
          <p>
            Email digest suppression: {settings.emailSuppressionReason}. Use
            another channel or contact support.
          </p>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              expectedVersion: settings.version,
              enabled,
              channel: f.get("channel"),
              frequency: f.get("frequency"),
              timezone: f.get("timezone"),
              consent: f.get("consent") === "on",
            });
          }}
        >
          <label className="inline">
            <input
              type="checkbox"
              name="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enable local digest simulation
          </label>
          <label>
            Channel
            <select name="channel" defaultValue={settings.channel}>
              <option value="email">Email — local simulation</option>
              <option value="telegram">Telegram — local simulation</option>
            </select>
          </label>
          <label>
            Frequency
            <select name="frequency" defaultValue={settings.frequency}>
              <option value="daily">Daily at 09:00</option>
              <option value="weekly">Monday at 09:00</option>
            </select>
          </label>
          <label>
            IANA timezone
            <input
              name="timezone"
              defaultValue={settings.timezone}
              required
              maxLength={80}
              placeholder="Africa/Lagos"
            />
          </label>
          <label className="inline">
            <input
              type="checkbox"
              name="consent"
              required={enabled}
              defaultChecked={!!settings.consentVersion}
            />
            I opt into opportunity digests in the local simulation. A live
            channel will need separate setup and consent.
          </label>
          <button disabled={busy}>Save digest settings</button>
        </form>
        <button
          className="secondary"
          disabled={busy || !settings.enabled || settings.channel !== "email"}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch("/api/me/email-unsubscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              const value = await r.json();
              if (!r.ok)
                throw Error(
                  value.error ?? "Unable to create a local test link.",
                );
              setTestLink(value.url);
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Create a local email unsubscribe test link
        </button>
        {testLink ? (
          <p>
            <a href={testLink} rel="noreferrer">
              Open unsubscribe confirmation
            </a>{" "}
            · Local test link; keep it private.
          </p>
        ) : null}
        <p>
          Saved state:{" "}
          {settings.enabled ? "Enabled for the local sink" : "Paused"}. Next
          scheduled time:{" "}
          {settings.nextDueAt
            ? new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: settings.timezone,
              }).format(new Date(settings.nextDueAt)) +
              " (" +
              settings.timezone +
              ")"
            : "None"}
          .
        </p>
        <button
          className="secondary"
          disabled={busy || !settings.enabled}
          onClick={() =>
            void save({
              expectedVersion: settings.version,
              enabled: false,
              channel: settings.channel,
              frequency: settings.frequency,
              timezone: settings.timezone,
              consent: false,
            })
          }
        >
          Pause digests now
        </button>
      </section>
      <section>
        <h2>Recent local digests</h2>
        {history.length ? (
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                {item.slot} · {item.channel} ·{" "}
                {item.state === "accepted"
                  ? "Accepted by local sink"
                  : item.state}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No digests planned yet. The local digest worker runs separately.
          </p>
        )}
        <p>
          Digests contain at most 10 current unseen matches. Empty digests are
          skipped. English fallback is disclosed when a selected alert
          translation is unavailable.
        </p>
      </section>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}

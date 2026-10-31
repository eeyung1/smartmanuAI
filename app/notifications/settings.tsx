"use client";
import { useScreenText } from "@/src/i18n/context";
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
  const { locale, t, label, message: translateMessage } = useScreenText();
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
    <div lang={locale}>
      <section className="form">
        <h2>{t("Digest settings")}</h2>
        {settings.emailSuppressionReason ? (
          <p>
            {t("Email digest suppression:")}{" "}
            {label(settings.emailSuppressionReason)}
            {t(". Use another channel or contact support.")}{" "}
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
            {t("Enable local digest simulation")}{" "}
          </label>
          <label>
            {t("Channel")}{" "}
            <select name="channel" defaultValue={settings.channel}>
              <option value="email">{t("Email — local simulation")}</option>
              <option value="telegram">
                {t("Telegram — local simulation")}
              </option>
            </select>
          </label>
          <label>
            {t("Frequency")}{" "}
            <select name="frequency" defaultValue={settings.frequency}>
              <option value="daily">{t("Daily at 09:00")}</option>
              <option value="weekly">{t("Monday at 09:00")}</option>
            </select>
          </label>
          <label>
            {t("IANA timezone")}{" "}
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
            {t(
              "I opt into opportunity digests in the local simulation. A live channel will need separate setup and consent.",
            )}{" "}
          </label>
          <button disabled={busy}>{t("Save digest settings")}</button>
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
          {t("Create a local email unsubscribe test link")}{" "}
        </button>
        {testLink ? (
          <p>
            <a href={testLink} rel="noreferrer">
              {t("Open unsubscribe confirmation")}{" "}
            </a>{" "}
            {t("· Local test link; keep it private.")}{" "}
          </p>
        ) : null}
        <p>
          {t("Saved state:")}{" "}
          {settings.enabled ? t("Enabled for the local sink") : t("Paused")}
          {t(". Next scheduled time:")}{" "}
          {settings.nextDueAt
            ? new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: settings.timezone,
              }).format(new Date(settings.nextDueAt)) +
              " (" +
              settings.timezone +
              ")"
            : t("None")}
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
          {t("Pause digests now")}{" "}
        </button>
      </section>
      <section>
        <h2>{t("Recent local digests")}</h2>
        {history.length ? (
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                {item.slot} · {label(item.channel)} ·{" "}
                {item.state === "accepted"
                  ? t("Accepted by local sink")
                  : label(item.state)}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {t(
              "No digests planned yet. The local digest worker runs separately.",
            )}{" "}
          </p>
        )}
        <p>
          {t(
            "Digests contain at most 10 current unseen matches. Empty digests are skipped. English fallback is disclosed when a selected alert translation is unavailable.",
          )}{" "}
        </p>
      </section>
      <p role="status" aria-live="polite">
        {translateMessage(message)}
      </p>
    </div>
  );
}

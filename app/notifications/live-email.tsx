"use client";
import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/src/i18n/locale";
import { screenMessage } from "@/src/i18n/screens";
import type { liveEmailSettings } from "@/src/email/settings";
type Settings = Awaited<ReturnType<typeof liveEmailSettings>>;
export default function LiveEmail({
  initial,
  operator,
  locale,
}: {
  initial: Settings;
  operator: boolean;
  locale: Locale;
}) {
  const zh = locale === "zh-Hans",
    t = (en: string, cn: string) => (zh ? cn : en);
  const [settings, setSettings] = useState(initial),
    [enabled, setEnabled] = useState(initial.enabled),
    [frequency, setFrequency] = useState(initial.frequency),
    [timezone, setTimezone] = useState(initial.timezone),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const refresh = async () => {
    const response = await fetch("/api/me/email-alerts", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    setSettings(data);
    setEnabled(data.enabled);
    setFrequency(data.frequency);
    setTimezone(data.timezone);
    setConsent(false);
  };
  const action = async (path: string, body?: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/me/email-alerts" + path, {
        method: path ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      await refresh();
      setMessage(
        data.state === "accepted"
          ? t(
              "Brevo accepted the test. Delivery is not yet confirmed; refresh history shortly.",
              "Brevo 已接收测试。尚未确认送达，请稍后刷新历史。",
            )
          : data.state
            ? t("Test outcome: ", "测试结果：") + data.state
            : t("Saved.", "已保存。"),
      );
    } catch (e) {
      setMessage(
        screenMessage(
          locale,
          e instanceof Error ? e.message : "Unable to complete the request.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section lang={locale}>
      <p className="eyebrow">{t("EMAIL-ONLY PILOT", "仅邮件试运行")}</p>
      <h1>{t("Your email alerts", "您的邮件提醒")}</h1>
      <p>
        {t(
          "Telegram is deferred. Email alerts use Brevo and require fresh consent.",
          "Telegram 暂缓启用。邮件提醒通过 Brevo 发送，需要重新同意。",
        )}
      </p>
      <p>
        {t(
          "The free-plan job runs once daily during the 09:00 UTC hour. Daily or Monday weekly digests become due at 09:00 in your timezone and are processed on the next run, sometimes the following day. No matching opportunities means no digest.",
          "免费计划每天在 UTC 09:00 所在小时运行一次。每日或每周一摘要在所选时区 09:00 到期，并在下一次任务运行时处理，有时会延至次日。没有匹配机会则不发送摘要。",
        )}
      </p>
      {!settings.providerConnected ? (
        <>
          <p>
            {t(
              "Brevo callbacks must be connected before enabling alerts.",
              "启用提醒前必须连接 Brevo 回调。",
            )}
          </p>
          {operator ? (
            <button disabled={busy} onClick={() => action("/provider")}>
              {t("Connect Brevo callbacks", "连接 Brevo 回调")}
            </button>
          ) : null}
        </>
      ) : (
        <p>{t("Brevo callbacks connected.", "Brevo 回调已连接。")}</p>
      )}
      {!settings.profileReady ? (
        <p>
          <Link href="/onboarding">
            {t(
              "Save your matching preferences before expecting scholarship digests. A delivery test does not need a profile.",
              "请先保存匹配偏好以接收奖学金摘要。投递测试不需要个人资料。",
            )}
          </Link>
        </p>
      ) : null}
      {settings.suppressionReason ? (
        <p role="status">
          {t(
            "Email is suppressed after a provider complaint or bounce. Contact the operator.",
            "因服务商投诉或退信，邮件已暂停。请联系管理员。",
          )}
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action("", {
            expectedVersion: settings.version,
            enabled,
            consent,
            frequency,
            timezone,
          });
        }}
      >
        <fieldset disabled={busy}>
          <legend>{t("Email preferences", "邮件偏好")}</legend>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {t("Enable email digests", "启用邮件摘要")}
          </label>
          <label>
            {t("Frequency", "频率")}
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <option value="daily">{t("Daily", "每日")}</option>
              <option value="weekly">{t("Weekly on Monday", "每周一")}</option>
            </select>
          </label>
          <label>
            {t("IANA timezone", "IANA 时区")}
            <input
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {t(
              "I consent to real opportunity digests and requested delivery tests at my verified email. Each email includes an unsubscribe link.",
              "我同意在已验证邮箱接收真实机会摘要及本人请求的投递测试。每封邮件均含退订链接。",
            )}
          </label>
          <button type="submit">
            {t("Save email preferences", "保存邮件偏好")}
          </button>
        </fieldset>
      </form>
      <button
        disabled={busy || !enabled || !settings.enabled}
        onClick={() => action("/test")}
      >
        {t("Send test email", "发送测试邮件")}
      </button>
      <p>
        {t(
          "Tests and digests share a cap of 3 attempts per recipient per UTC day and 10 across this pilot. Uncertain sends are never retried automatically. Accepted does not mean delivered.",
          "测试和摘要共享每日 UTC 上限：每位收件人 3 次，试运行合计 10 次。结果不确定的发送不会自动重试。已接收不代表已送达。",
        )}
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await refresh();
          } catch {
            setMessage(t("Unable to refresh.", "无法刷新。"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("Refresh history", "刷新历史")}
      </button>
      <p role="status">{message}</p>
      <h2>{t("Recent deliveries", "近期投递")}</h2>
      {settings.history.length ? (
        <ul>
          {settings.history.map((row) => (
            <li key={String(row.id)}>
              {String(row.kind)} — {String(row.provider_state ?? row.state)}
              {row.error_code ? " · " + String(row.error_code) : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("No deliveries yet.", "尚无投递。")}</p>
      )}
    </section>
  );
}

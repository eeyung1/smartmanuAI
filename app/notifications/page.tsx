import { interfaceLocale } from "@/src/i18n/server";
import { screenText } from "@/src/i18n/screens";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { readNotificationSettings, digestHistory } from "@/src/jobs/digests";
import { telegramConfig, telegramStatus } from "@/src/channels/telegram";
import TelegramConnection from "./telegram-connection";
import { deliveryHistory } from "@/src/delivery/simulation";
import DeliveryTests from "./delivery-tests";
import NotificationSettings from "./settings";
export const dynamic = "force-dynamic";
export default async function Notifications() {
  const locale = await interfaceLocale();
  const t = (key: string) => screenText(locale, key);
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { sql } = await getDatabase();
  const [settings, history] = await Promise.all([
    readNotificationSettings(sql, session.user.id),
    digestHistory(sql, session.user.id),
  ]);
  const deliveries = await deliveryHistory(sql, session.user.id);
  const binding = await telegramStatus(sql, session.user.id);
  let available = true;
  try {
    telegramConfig();
  } catch {
    available = false;
  }
  return (
    <div lang={locale}>
      <p className="eyebrow">{t("YOUR ALERT PREFERENCES")}</p>
      <h1>{t("Stay in the loop.")}</h1>
      <p>
        {t(
          "Choose one channel and a digest schedule. In this local prototype, email and Telegram are simulated: messages stay in a private local test sink. No real channel is connected.",
        )}{" "}
      </p>
      <DeliveryTests initial={JSON.parse(JSON.stringify(deliveries))} />
      <TelegramConnection initial={binding} available={available} />
      <NotificationSettings
        initial={settings}
        initialHistory={JSON.parse(JSON.stringify(history))}
      />
    </div>
  );
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { readNotificationSettings, digestHistory } from "@/src/jobs/digests";
import NotificationSettings from "./settings";
export const dynamic = "force-dynamic";
export default async function Notifications() {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { sql } = await getDatabase();
  const [settings, history] = await Promise.all([
    readNotificationSettings(sql, session.user.id),
    digestHistory(sql, session.user.id),
  ]);
  return (
    <>
      <p className="eyebrow">YOUR ALERT PREFERENCES</p>
      <h1>Stay in the loop.</h1>
      <p>
        Choose one channel and a digest schedule. In this local prototype, email
        and Telegram are simulated: messages stay in a private local test sink.
        No real channel is connected.
      </p>
      <NotificationSettings
        initial={settings}
        initialHistory={JSON.parse(JSON.stringify(history))}
      />
    </>
  );
}

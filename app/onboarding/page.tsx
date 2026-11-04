import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { readOnboardingProgress, readProfile } from "@/src/domain/profile";
import { interfaceLocale } from "@/src/i18n/server";
import OnboardingWizard from "./wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await (
    await getAuth()
  ).api.getSession({
    headers: await headers(),
  });
  if (!session) redirect("/sign-in?returnTo=%2Fonboarding");
  const { sql } = await getDatabase();
  const [progress, profile] = await Promise.all([
    readOnboardingProgress(sql, session.user.id),
    readProfile(sql, session.user.id),
  ]);
  if (progress.completed) redirect("/matches");
  return (
    <OnboardingWizard
      locale={await interfaceLocale()}
      initialProgress={{
        ...progress,
        values: { ...(profile ?? {}), ...progress.values },
      }}
    />
  );
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { readProfile } from "@/src/domain/profile";
import { listTracker } from "@/src/domain/tracker";
import { matchesForUser } from "@/src/domain/matching";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Matches() {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { sql } = await getDatabase();
  const [profile, tracker, matches] = await Promise.all([
    readProfile(sql, session.user.id),
    listTracker(sql, session.user.id),
    matchesForUser(sql, session.user.id),
  ]);
  return (
    <>
      <p className="eyebrow">YOUR PRIVATE SPACE</p>
      <h1>A step closer.</h1>
      <p>
        Signed in as {session.user.email}. Matches use your saved preferences
        and reviewed source facts. They do not confirm admission eligibility.
      </p>
      <Workspace
        profile={profile}
        initialTracker={tracker}
        initialMatches={matches}
      />
    </>
  );
}

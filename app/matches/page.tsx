import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { listSaved, readProfile } from "@/src/domain/profile";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Matches() {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { sql } = await getDatabase();
  const [profile, saved] = await Promise.all([
    readProfile(sql, session.user.id),
    listSaved(sql, session.user.id),
  ]);
  return (
    <>
      <p className="eyebrow">YOUR PRIVATE SPACE</p>
      <h1>A step closer.</h1>
      <p>
        Signed in as {session.user.email}. Personalized research is not
        connected yet.
      </p>
      <Workspace profile={profile} saved={saved} />
    </>
  );
}

import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { researchDashboard } from "@/src/research/collection";
import ResearchWorkspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Research() {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  let data;
  try {
    data = await researchDashboard((await getDatabase()).sql, session.user.id);
  } catch {
    notFound();
  }
  return (
    <>
      <p className="eyebrow">SOURCE COLLECTION</p>
      <h1>Evidence before extraction.</h1>
      <p>
        Enable collection only after checking source ownership and permitted
        access. Collection runs in a separate worker. No source instructions are
        executed.
      </p>
      <Link href="/admin/review">Opportunity review</Link>
      <ResearchWorkspace initial={JSON.parse(JSON.stringify(data))} />
    </>
  );
}

import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { adminCatalogue } from "@/src/catalogue/service";
import ReviewWorkspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Review() {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  let data;
  try {
    data = await adminCatalogue((await getDatabase()).sql, session.user.id);
  } catch {
    notFound();
  }
  return (
    <>
      <p className="eyebrow">ADMINISTRATION</p>
      <h1>Review before sharing.</h1>
      <p>
        Check the source and evidence before publishing. Edits return a record
        to draft until reviewed again.
      </p>
      <Link href="/admin/research">Source collection and candidates</Link>
      <ReviewWorkspace initial={JSON.parse(JSON.stringify(data))} />
    </>
  );
}

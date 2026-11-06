import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { CatalogueError } from "@/src/catalogue/service";
import { operationsOverview } from "@/src/research/operations";
import { interfaceLocale } from "@/src/i18n/server";
import OperationsSummary from "./summary";
export const dynamic = "force-dynamic";
export default async function Operations() {
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?returnTo=%2Fadmin%2Foperations");
  try {
    const data = await operationsOverview(
      (await getDatabase()).sql,
      session.user.id,
    );
    return <OperationsSummary data={data} locale={await interfaceLocale()} />;
  } catch (error) {
    if (error instanceof CatalogueError && error.status === 403) notFound();
    throw error;
  }
}

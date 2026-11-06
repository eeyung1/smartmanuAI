import { interfaceLocale } from "@/src/i18n/server";
import { screenText } from "@/src/i18n/screens";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { CatalogueError } from "@/src/catalogue/service";
import {
  researchSelectionSchema,
  selectedResearchData,
} from "@/src/research/browse";
import { ZodError } from "zod";
import ResearchWorkspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Research({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await interfaceLocale();
  const t = (key: string) => screenText(locale, key);
  const session = await (
    await getAuth()
  ).api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  let data;
  try {
    data = await selectedResearchData(
      (await getDatabase()).sql,
      session.user.id,
      researchSelectionSchema.parse(await searchParams),
    );
  } catch (error) {
    if (
      error instanceof ZodError ||
      (error instanceof CatalogueError && [403, 404].includes(error.status))
    )
      notFound();
    throw error;
  }
  return (
    <div lang={locale}>
      <p className="eyebrow">{t("SOURCE COLLECTION")}</p>
      <h1>{t("Evidence before extraction.")}</h1>
      <p>
        {t(
          "Enable collection only after checking source ownership and permitted access. Collection runs in a separate worker. No source instructions are executed.",
        )}{" "}
      </p>
      <p>
        <Link href="/admin/operations">{t("Operations overview")}</Link>
        {" · "}
        <Link href="/admin/research/browse">
          {t("Browse all research records")}
        </Link>
      </p>
      <Link href="/admin/review">{t("Opportunity review")}</Link>
      <ResearchWorkspace
        key={new URLSearchParams(data.selection).toString()}
        initial={JSON.parse(JSON.stringify(data.data))}
        refreshQuery={new URLSearchParams(data.selection).toString()}
      />
    </div>
  );
}

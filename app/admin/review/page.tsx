import { interfaceLocale } from "@/src/i18n/server";
import { screenText } from "@/src/i18n/screens";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getAuth } from "@/src/auth";
import { getDatabase } from "@/src/db";
import { CatalogueError } from "@/src/catalogue/service";
import {
  editorQuerySchema,
  reviewEditorData,
} from "@/src/catalogue/admin-browse";
import { ZodError } from "zod";
import ReviewWorkspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Review({
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
    data = await reviewEditorData(
      (await getDatabase()).sql,
      session.user.id,
      editorQuerySchema.parse(await searchParams),
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
      <p className="eyebrow">{t("ADMINISTRATION")}</p>
      <h1>{t("Review before sharing.")}</h1>
      <p>
        {t(
          "Check the source and evidence before publishing. Edits return a record to draft until reviewed again.",
        )}{" "}
      </p>
      <p>
        <Link href="/admin/catalogue">
          {t("Browse all records and sources")}
        </Link>
      </p>
      <Link href="/admin/research">
        {t("Source collection and candidates")}
      </Link>
      <ReviewWorkspace
        initial={JSON.parse(
          JSON.stringify({
            sources: data.sources,
            opportunities: data.opportunities,
          }),
        )}
        initialEditing={
          data.editing ? JSON.parse(JSON.stringify(data.editing)) : null
        }
        initialSourceId={data.sourceId}
      />
    </div>
  );
}

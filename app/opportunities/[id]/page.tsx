import { interfaceLocale } from "@/src/i18n/server";
import { screenText, screenLabel } from "@/src/i18n/screens";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/src/db";
import { publicOpportunity } from "@/src/catalogue/service";
import SaveButton from "./save-button";
export const dynamic = "force-dynamic";
function coverage(value: boolean | null) {
  return value === true
    ? "Covered"
    : value === false
      ? "Not covered"
      : "Not stated";
}
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const locale = await interfaceLocale();
  const t = (key: string, values?: Record<string, string | number>) =>
    screenText(locale, key, values);
  const label = (value: string) => screenLabel(locale, value);
  const item = await publicOpportunity(
    (await getDatabase()).sql,
    (await params).id,
  );
  if (!item) notFound();
  const d = item.details;
  return (
    <div lang={locale}>
      <Link href="/opportunities">{t("Back to opportunities")}</Link>
      <p className="eyebrow">
        {label(d.category)} · {d.mode === "online" ? t("Online") : d.country}
      </p>
      <h1 lang="">{d.title}</h1>
      <p className="intro" lang="">
        {d.organizer}
      </p>
      {item.synthetic ? (
        <div className="notice">
          {t(
            "Synthetic fixture for local testing. This is not a real opportunity.",
          )}{" "}
        </div>
      ) : null}
      {!item.available ? (
        <div className="notice">
          {t(
            "This opportunity is closed or needs a fresh source check. New saves and application actions are paused.",
          )}{" "}
        </div>
      ) : null}
      <p lang="">{d.summary}</p>
      <section>
        <h2>{t("Funding and remaining costs")}</h2>
        <p className="tags">
          <span>{label(d.funding)}</span>
        </p>
        <dl>
          {Object.entries({
            Tuition: t(coverage(d.tuitionCovered)),
            Accommodation: t(coverage(d.accommodationCovered)),
            "Living costs": t(coverage(d.livingCostsCovered)),
            "Participation fee":
              d.participationFree === true
                ? t("Free")
                : d.participationFree === false
                  ? t("Not free")
                  : t("Not stated"),
            "Application fee": d.applicationFee ?? t("Not stated"),
            "Certificate fee": d.certificateFee ?? t("Not stated"),
            "Travel costs": d.travelCosts ?? t("Not stated"),
            "Coverage duration": d.coverageDuration ?? t("Not stated"),
          }).map(([name, value]) => (
            <div key={name}>
              <dt>{t(name)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2>{t("Eligibility and deadline")}</h2>
        <p lang="">{d.eligibility}</p>
        <p>
          {t("Teaching language:")} {label(d.teachingLanguage)}
        </p>
        <p>
          {t("Application deadline:")} {d.deadline ?? t("Not stated")}
          {d.deadline ? t(" · Date only; timezone not stated.") : ""}
        </p>
        {d.deadlineText ? (
          <p>
            {t("Source wording:")} {d.deadlineText}
          </p>
        ) : null}
        <p>
          {t("Topics:")} {d.topics.join(", ")}
        </p>
      </section>
      <section>
        <h2>{t("Official source")}</h2>
        <p>{item.source_name}</p>
        {!item.synthetic ? (
          <a href={item.source_url} rel="noopener noreferrer" target="_blank">
            {item.available
              ? t("Open official application information")
              : t("Read the source information")}
          </a>
        ) : (
          <p>
            {t("No live application link is available for synthetic records.")}
          </p>
        )}
        <p>
          {t("Last verified:")}{" "}
          {item.verified_at?.slice(0, 10) ?? t("Not stated")} {t("· Revision")}{" "}
          {item.revision}
        </p>
        <p>
          {t(
            "Requirements can change. Review the official information before applying.",
          )}{" "}
        </p>
        {item.available ? <SaveButton id={item.id} /> : null}
      </section>
    </div>
  );
}

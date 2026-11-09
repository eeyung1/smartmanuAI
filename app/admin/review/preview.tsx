"use client";
import { useState } from "react";
import type { Details } from "@/src/catalogue/schema";
import { useScreenText } from "@/src/i18n/context";

export type PreviewSource = {
  id: string;
  name: string;
  url: string;
  synthetic: boolean;
};
export type PreviewEvidence = {
  title: string;
  funding: string;
  deadline: string;
  eligibility: string;
};
export type PolicyWarningCode =
  | "source-missing"
  | "source-synthetic"
  | "source-unverified"
  | "evidence-incomplete"
  | "deadline-closing"
  | "deadline-source-text"
  | "fully-funded"
  | "tuition-only"
  | "free-participation"
  | "scholarship-country"
  | "scholarship-free"
  | "in-person-country"
  | "in-person-scope";

export function publicationWarnings(
  details: Details,
  source: PreviewSource | null,
  evidence: PreviewEvidence,
  sourceVerified: boolean,
  today = new Date().toISOString().slice(0, 10),
): PolicyWarningCode[] {
  const warnings: PolicyWarningCode[] = [];
  if (!source) warnings.push("source-missing");
  else if (source.synthetic) warnings.push("source-synthetic");
  else if (!sourceVerified) warnings.push("source-unverified");
  if (
    ![
      evidence.title,
      evidence.funding,
      evidence.deadline,
      evidence.eligibility,
    ].every((quote) => quote.trim().length >= 3)
  )
    warnings.push("evidence-incomplete");
  if (details.deadline && details.deadline <= today)
    warnings.push("deadline-closing");
  if (details.deadline && !details.deadlineText)
    warnings.push("deadline-source-text");
  if (
    details.funding === "fully_funded" &&
    ![
      details.tuitionCovered,
      details.accommodationCovered,
      details.livingCostsCovered,
    ].every((value) => value === true)
  )
    warnings.push("fully-funded");
  if (details.funding === "tuition_only" && details.tuitionCovered !== true)
    warnings.push("tuition-only");
  if (
    details.funding === "free_participation" &&
    details.participationFree !== true
  )
    warnings.push("free-participation");
  if (details.category === "scholarship" && details.country !== "CN")
    warnings.push("scholarship-country");
  if (
    details.category === "scholarship" &&
    details.funding === "free_participation"
  )
    warnings.push("scholarship-free");
  if (details.mode === "in_person" && details.country === null)
    warnings.push("in-person-country");
  if (details.mode === "in_person" && details.country !== "CN")
    warnings.push("in-person-scope");
  return warnings;
}

const warningCopy: Record<PolicyWarningCode, [string, string]> = {
  "source-missing": [
    "Select a registered source before publishing.",
    "发布前请选择已登记的来源。",
  ],
  "source-synthetic": [
    "This is a synthetic source. Verify a real official source before publication.",
    "这是模拟来源。发布前请核实真实官方来源。",
  ],
  "source-unverified": [
    "Check the official source and field evidence before publication.",
    "发布前请核实官方来源及字段证据。",
  ],
  "evidence-incomplete": [
    "Add source excerpts for the title, funding, deadline and eligibility.",
    "请补充标题、资助、截止日期及申请条件的来源摘录。",
  ],
  "deadline-closing": [
    "The deadline is today or earlier. The public catalogue excludes opportunities closing today or in the past (UTC date only).",
    "截止日期为今天或更早。公开目录会排除今天截止或已过期的机会（仅按 UTC 日期判断）。",
  ],
  "deadline-source-text": [
    "Keep the original deadline wording from the source.",
    "请保留来源中的截止日期原文。",
  ],
  "fully-funded": [
    "Fully funded requires supported tuition, accommodation and living costs.",
    "“全额资助”必须有证据支持学费、住宿费和生活费。",
  ],
  "tuition-only": [
    "Tuition-only funding requires supported tuition coverage.",
    "“仅覆盖学费”必须有证据支持学费资助。",
  ],
  "free-participation": [
    "Free participation requires source evidence that participation is free.",
    "“免费参与”必须有来源证据支持。",
  ],
  "scholarship-country": [
    "Scholarships in this catalogue must be located in China (CN).",
    "此目录中的奖学金必须位于中国（CN）。",
  ],
  "scholarship-free": [
    "Use scholarship funding coverage instead of the free-participation label.",
    "奖学金请填写资助覆盖情况，不要使用“免费参与”标签。",
  ],
  "in-person-country": [
    "In-person opportunities need a country.",
    "线下机会必须填写国家或地区。",
  ],
  "in-person-scope": [
    "The current catalogue supports in-person opportunities in China only.",
    "当前目录仅支持中国境内的线下机会。",
  ],
};

function coverage(value: boolean | null, t: (key: string) => string) {
  return value === true
    ? t("Covered")
    : value === false
      ? t("Not covered")
      : t("Not stated");
}

export default function OpportunityPreview({
  details,
  source,
  evidence,
  verificationKey,
}: {
  details: Details;
  source: PreviewSource | null;
  evidence: PreviewEvidence;
  verificationKey: string;
}) {
  const { locale, t, label } = useScreenText(),
    [verifiedKey, setVerifiedKey] = useState("");
  const sourceVerified =
      !!source && !source.synthetic && verifiedKey === verificationKey,
    warnings = publicationWarnings(details, source, evidence, sourceVerified),
    copy = (english: string, chinese: string) =>
      locale === "zh-Hans" ? chinese : english;
  let sourceHref: string | null = null;
  try {
    const parsed = source ? new URL(source.url) : null;
    if (parsed?.protocol === "https:") sourceHref = parsed.href;
  } catch {
    sourceHref = null;
  }
  const costRows: Array<[string, string]> = [
    [t("Tuition"), coverage(details.tuitionCovered, t)],
    [t("Accommodation"), coverage(details.accommodationCovered, t)],
    [t("Living costs"), coverage(details.livingCostsCovered, t)],
    [
      t("Participation fee"),
      details.participationFree === true
        ? t("Free")
        : details.participationFree === false
          ? t("Not free")
          : t("Not stated"),
    ],
    [t("Application fee"), details.applicationFee ?? t("Not stated")],
    [t("Certificate fee"), details.certificateFee ?? t("Not stated")],
    [t("Travel costs"), details.travelCosts ?? t("Not stated")],
    [t("Coverage duration"), details.coverageDuration ?? t("Not stated")],
  ];
  return (
    <section aria-labelledby="publication-preview-heading">
      <h2 id="publication-preview-heading">
        {copy("Live publication preview", "实时发布预览")}
      </h2>
      <p>
        {copy(
          "This preview follows the public opportunity card and detail page. It does not publish the record.",
          "此预览与公开机会卡片及详情页一致，但不会发布记录。",
        )}
      </p>
      <div className="catalogue">
        <article aria-label={copy("Opportunity card preview", "机会卡片预览")}>
          <div className="tags">
            <span>{label(details.category)}</span>
            <span>{label(details.funding)}</span>
            {source?.synthetic ? <span>{t("Synthetic fixture")}</span> : null}
          </div>
          <h3 lang="">{details.title || t("Title")}</h3>
          <p lang="">{details.summary || t("Summary")}</p>
          <p>
            {details.organizer || t("Organizer")} ·{" "}
            {details.mode === "online"
              ? t("Online")
              : details.country || t("Not stated")}
          </p>
          <p>
            {t("Deadline:")} {details.deadline ?? t("Not stated")}
            {details.deadline ? t(" · Timezone not stated") : ""}
          </p>
          <p>
            {t("Application fee:")} {details.applicationFee ?? t("Not stated")}
          </p>
          <p className="muted">
            {t("Last verified:")} {t("Not stated")}
          </p>
          <span className="button">{copy("View details", "查看详情")}</span>
        </article>
      </div>
      <article aria-label={copy("Opportunity detail preview", "机会详情预览")}>
        <p className="eyebrow">
          {label(details.category)} ·{" "}
          {details.mode === "online"
            ? t("Online")
            : details.country || t("Not stated")}
        </p>
        <h3 lang="">{details.title || t("Title")}</h3>
        <p className="intro" lang="">
          {details.organizer || t("Organizer")}
        </p>
        <p>
          {t("Intake / event edition:")}{" "}
          <span lang="">{details.offeringIdentity ?? t("Not stated")}</span>
        </p>
        {source?.synthetic ? (
          <div className="notice">
            {t(
              "Synthetic fixture for local testing. This is not a real opportunity.",
            )}
          </div>
        ) : null}
        <p lang="">{details.summary || t("Summary")}</p>
        <section>
          <h4>{t("Funding and remaining costs")}</h4>
          <p className="tags">
            <span>{label(details.funding)}</span>
          </p>
          <dl>
            {costRows.map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h4>{t("Eligibility and deadline")}</h4>
          <p lang="">{details.eligibility || t("Eligibility")}</p>
          <p>
            {t("Teaching language:")} {label(details.teachingLanguage)}
          </p>
          <p>
            {t("Application deadline:")} {details.deadline ?? t("Not stated")}
            {details.deadline ? t(" · Date only; timezone not stated.") : ""}
          </p>
          {details.deadlineText ? (
            <p>
              {t("Source wording:")} {details.deadlineText}
            </p>
          ) : null}
          <p>
            {t("Topics:")} {details.topics.join(", ") || t("Not stated")}
          </p>
        </section>
        <section>
          <h4>{t("Official source")}</h4>
          <p>{source?.name || t("Select a registered source")}</p>
          <p>
            {t("Intake / event edition:")}{" "}
            <span lang="">{details.offeringIdentity ?? t("Not stated")}</span>
          </p>
          {source?.synthetic ? (
            <p>
              {t(
                "No live application link is available for synthetic records.",
              )}
            </p>
          ) : sourceHref ? (
            <a href={sourceHref} rel="noopener noreferrer" target="_blank">
              {t("Open official application information")}
            </a>
          ) : null}
          <p>
            {t("Last verified:")} {t("Not stated")}
          </p>
        </section>
      </article>
      <section aria-labelledby="publication-policy-heading">
        <h3 id="publication-policy-heading">
          {copy("Publication policy checks", "发布政策检查")}
        </h3>
        {source && !source.synthetic ? (
          <label className="inline">
            <input
              type="checkbox"
              checked={sourceVerified}
              onChange={(event) =>
                setVerifiedKey(event.target.checked ? verificationKey : "")
              }
            />
            {copy(
              "I checked the official source and all field evidence",
              "我已核实官方来源及所有字段证据",
            )}
          </label>
        ) : null}
        {warnings.length ? (
          <ul role="status" aria-live="polite">
            {warnings.map((warning) => (
              <li key={warning}>
                {warningCopy[warning][locale === "zh-Hans" ? 1 : 0]}
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" aria-live="polite">
            {copy(
              "No publication policy warnings. Record an admin review decision to publish.",
              "未发现发布政策警告。请通过管理员审核操作发布记录。",
            )}
          </p>
        )}
      </section>
    </section>
  );
}

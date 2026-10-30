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
  const item = await publicOpportunity(
    (await getDatabase()).sql,
    (await params).id,
  );
  if (!item) notFound();
  const d = item.details;
  return (
    <>
      <Link href="/opportunities">Back to opportunities</Link>
      <p className="eyebrow">
        {d.category} · {d.mode === "online" ? "Online" : d.country}
      </p>
      <h1>{d.title}</h1>
      <p className="intro">{d.organizer}</p>
      {item.synthetic ? (
        <div className="notice">
          Synthetic fixture for local testing. This is not a real opportunity.
        </div>
      ) : null}
      {!item.available ? (
        <div className="notice">
          This opportunity is closed or needs a fresh source check. New saves
          and application actions are paused.
        </div>
      ) : null}
      <p>{d.summary}</p>
      <section>
        <h2>Funding and remaining costs</h2>
        <p className="tags">
          <span>{d.funding.replaceAll("_", " ")}</span>
        </p>
        <dl>
          {Object.entries({
            Tuition: coverage(d.tuitionCovered),
            Accommodation: coverage(d.accommodationCovered),
            "Living costs": coverage(d.livingCostsCovered),
            "Participation fee":
              d.participationFree === true
                ? "Free"
                : d.participationFree === false
                  ? "Not free"
                  : "Not stated",
            "Application fee": d.applicationFee ?? "Not stated",
            "Certificate fee": d.certificateFee ?? "Not stated",
            "Travel costs": d.travelCosts ?? "Not stated",
            "Coverage duration": d.coverageDuration ?? "Not stated",
          }).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2>Eligibility and deadline</h2>
        <p>{d.eligibility}</p>
        <p>
          Teaching language:{" "}
          {d.teachingLanguage === "unknown" ? "Not stated" : d.teachingLanguage}
        </p>
        <p>
          Application deadline: {d.deadline ?? "Not stated"}
          {d.deadline ? " · Date only; timezone not stated." : ""}
        </p>
        {d.deadlineText ? <p>Source wording: {d.deadlineText}</p> : null}
        <p>Topics: {d.topics.join(", ")}</p>
      </section>
      <section>
        <h2>Official source</h2>
        <p>{item.source_name}</p>
        {!item.synthetic ? (
          <a href={item.source_url} rel="noopener noreferrer" target="_blank">
            {item.available
              ? "Open official application information"
              : "Read the source information"}
          </a>
        ) : (
          <p>No live application link is available for synthetic records.</p>
        )}
        <p>
          Last verified: {item.verified_at?.slice(0, 10) ?? "Not stated"} ·
          Revision {item.revision}
        </p>
        <p>
          Requirements can change. Review the official information before
          applying.
        </p>
        {item.available ? <SaveButton id={item.id} /> : null}
      </section>
    </>
  );
}

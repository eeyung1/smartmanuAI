import test from "node:test";
import assert from "node:assert/strict";
import {
  findBrochureDates,
  parseBrochureDocument,
} from "../src/research/brochure-parser";

const brochure = `# Smart Manufacturing Master's Scholarship

## Program Overview
A two-year smart manufacturing programme with laboratory teaching.

## Scholarship Coverage
| Item | Detail |
| --- | --- |
| Tuition waiver | Full tuition waived for the whole programme |
| Accommodation | Dormitory accommodation provided |
| Monthly living allowance | CNY 3,000 per month |

## Eligibility Criteria
- Bachelor's degree in mechanical, electrical or automation engineering
- Age under 30

## Application Documents
- Transcript and certificate
- Passport copy
- Study plan

## Important Dates
Application opens: 2026-11-01
Application deadline: 2027-03-01
Interview: 2027-04-10
Result notification: 2027-05-20
`;

test("brochure sections, funding, documents and milestones are extracted", () => {
  const parsed = parseBrochureDocument(brochure);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.title, "Smart Manufacturing Master's Scholarship");
  const kinds = parsed.sections.map((section) => section.kind);
  assert.ok(kinds.includes("overview"));
  assert.ok(kinds.includes("funding"));
  assert.ok(kinds.includes("eligibility"));
  assert.ok(kinds.includes("documents"));
  assert.ok(kinds.includes("dates"));

  assert.equal(parsed.funding.tuitionWaiver, true);
  assert.equal(parsed.funding.accommodation, true);
  assert.equal(parsed.funding.monthlyAllowanceCny, 3000);
  assert.equal(parsed.fundingTier, "fully_funded");
  assert.deepEqual(parsed.documents, [
    "Transcript and certificate",
    "Passport copy",
    "Study plan",
  ]);

  const deadlines = parsed.milestones.filter(
    (milestone) => milestone.kind === "application_deadline",
  );
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0].date, "2027-03-01");
  assert.equal(
    parsed.milestones.find((milestone) => milestone.kind === "interview")?.date,
    "2027-04-10",
  );
  assert.equal(
    parsed.milestones.find(
      (milestone) => milestone.kind === "result_notification",
    )?.date,
    "2027-05-20",
  );
  assert.ok(parsed.confidence > 0.7);
});

test("dates are normalized from several written formats", () => {
  assert.deepEqual(findBrochureDates("Deadline 2027-03-01"), ["2027-03-01"]);
  assert.deepEqual(findBrochureDates("截止 2027年3月1日"), ["2027-03-01"]);
  assert.deepEqual(findBrochureDates("due March 1, 2027"), ["2027-03-01"]);
  assert.deepEqual(findBrochureDates("due 1 March 2027"), ["2027-03-01"]);
  assert.deepEqual(findBrochureDates("no date here"), []);
  assert.deepEqual(findBrochureDates("2027-02-30"), []);
});

test("chinese section headings and funding are recognized", () => {
  const parsed = parseBrochureDocument(`# 智能制造奖学金

## 奖学金
学费全免
提供住宿
每月生活补助 CNY 2,500

## 申请材料
- 成绩单
- 护照

## 重要日期
申请截止：2027年4月30日
`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.funding.tuitionWaiver, true);
  assert.equal(parsed.funding.accommodation, true);
  assert.equal(parsed.funding.monthlyAllowanceCny, 2500);
  assert.deepEqual(parsed.documents, ["成绩单", "护照"]);
  assert.equal(
    parsed.milestones.find(
      (milestone) => milestone.kind === "application_deadline",
    )?.date,
    "2027-04-30",
  );
});

test("partial funding is classified without overstating coverage", () => {
  const parsed = parseBrochureDocument(`## Scholarship Coverage
Monthly living allowance CNY 1,500 per month
`);
  assert.equal(parsed.funding.tuitionWaiver, false);
  assert.equal(parsed.fundingTier, "partial");
  assert.equal(parsed.funding.monthlyAllowanceCny, 1500);
});

test("malformed or unstructured brochures degrade gracefully", () => {
  const empty = parseBrochureDocument("");
  assert.equal(empty.ok, false);
  assert.equal(empty.confidence, 0);
  assert.equal(empty.diagnostics[0].code, "empty_content");

  const unstructured = parseBrochureDocument(
    "just some notes without structure",
  );
  assert.equal(unstructured.ok, true);
  assert.equal(unstructured.sections[0].kind, "other");
  assert.ok(
    unstructured.diagnostics.some(
      (item) => item.code === "no_sections_detected",
    ),
  );
  assert.ok(unstructured.confidence < 0.5);

  const truncated = parseBrochureDocument(brochure, {
    maxContentLength: 120,
  });
  assert.ok(
    truncated.diagnostics.some((item) => item.code === "content_truncated"),
  );
  assert.equal(parseBrochureDocument(null).ok, false);
});

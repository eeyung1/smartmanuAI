import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpportunityPreview, {
  publicationWarnings,
  type PreviewEvidence,
  type PreviewSource,
} from "../app/admin/review/preview";
import { LocaleProvider } from "../src/i18n/context";
import type { Details } from "../src/catalogue/schema";

const details: Details = {
  studyLevel: null,
  eligibilityRules: null,
  title: "Smart manufacturing fellowship",
  organizer: "Example Institute",
  summary: "A practical course for manufacturing researchers.",
  category: "course",
  mode: "online",
  country: null,
  teachingLanguage: "en",
  topics: ["smart manufacturing"],
  funding: "fully_funded",
  tuitionCovered: true,
  accommodationCovered: true,
  livingCostsCovered: true,
  participationFree: null,
  applicationFee: null,
  certificateFee: null,
  travelCosts: null,
  coverageDuration: null,
  deadline: "2099-06-30",
  deadlineText: "Apply by 30 June 2099",
  eligibility: "Open to manufacturing researchers.",
};
const source: PreviewSource = {
  id: "source-1",
  name: "Example Institute",
  url: "https://example.org/programme",
  synthetic: false,
};
const evidence: PreviewEvidence = {
  title: "Smart manufacturing fellowship",
  funding: "Tuition, accommodation and living costs are covered.",
  deadline: "Apply by 30 June 2099",
  eligibility: "Open to manufacturing researchers.",
};

test("publication warnings surface source, evidence, deadline and policy blockers", () => {
  const invalid: Details = {
    ...details,
    category: "scholarship",
    country: "US",
    mode: "in_person",
    funding: "fully_funded",
    livingCostsCovered: false,
    deadline: "2020-01-01",
    deadlineText: null,
  };
  assert.deepEqual(
    publicationWarnings(
      invalid,
      null,
      { ...evidence, title: "  " },
      false,
      "2026-11-04",
    ),
    [
      "source-missing",
      "evidence-incomplete",
      "deadline-closing",
      "deadline-source-text",
      "fully-funded",
      "scholarship-country",
      "in-person-scope",
    ],
  );
  assert.ok(
    publicationWarnings(
      details,
      { ...source, synthetic: true },
      evidence,
      false,
    ).includes("source-synthetic"),
  );
  assert.ok(
    publicationWarnings(details, source, evidence, false).includes(
      "source-unverified",
    ),
  );
  assert.deepEqual(publicationWarnings(details, source, evidence, true), []);
});

test("preview renders public card, detail, verification control and policy warnings in both locales", () => {
  for (const locale of ["en", "zh-Hans"] as const) {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale,
        children: createElement(OpportunityPreview, {
          details,
          source,
          evidence: { ...evidence, funding: "" },
          verificationKey: "current-draft",
        }),
      }),
    );
    assert.ok(html.includes("Smart manufacturing fellowship"));
    assert.ok(
      html.includes("Funding and remaining costs") ||
        html.includes("资助及剩余费用"),
    );
    assert.ok(html.includes('type="checkbox"'));
    assert.ok(
      html.includes("Add source excerpts") || html.includes("请补充标题"),
    );
    assert.ok(html.includes("Apply by 30 June 2099"));
  }
});

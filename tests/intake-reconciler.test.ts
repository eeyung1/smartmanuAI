import test from "node:test";
import assert from "node:assert/strict";
import {
  parseIntakeTerm,
  reconcileIntakeIdentity,
} from "../src/catalogue/intake-reconciler";

const now = new Date("2026-11-10T00:00:00.000Z");

test("intake labels parse into canonical terms across English and Chinese variants", () => {
  assert.deepEqual(parseIntakeTerm("Fall 2026"), {
    year: 2026,
    term: "fall",
    canonical: "2026-fall",
    sortKey: 2026 * 4 + 3,
  });
  assert.equal(parseIntakeTerm("Autumn 2026")?.canonical, "2026-fall");
  assert.equal(parseIntakeTerm("autumn 2026")?.canonical, "2026-fall");
  assert.equal(parseIntakeTerm("Spring 2027")?.canonical, "2027-spring");
  assert.equal(parseIntakeTerm("2026秋季")?.canonical, "2026-fall");
  assert.equal(parseIntakeTerm("2027春季")?.canonical, "2027-spring");
  assert.equal(parseIntakeTerm("秋季2026")?.canonical, "2026-fall");
  assert.equal(
    parseIntakeTerm("2026-2027 Academic Year")?.canonical,
    "2026-2027",
  );
  assert.equal(parseIntakeTerm("2026学年")?.canonical, "2026-2027");
  assert.equal(parseIntakeTerm("Fall 2026")?.term, "fall");
  for (const invalid of ["", "   ", null, undefined, "autumn", "2026", "20xx"])
    assert.equal(parseIntakeTerm(invalid), null);
});

test("the same edition is detected exactly and across aliases", () => {
  const existing = [
    {
      id: "offering-fall-2026",
      identity: "Autumn 2026",
      title: "Smart Manufacturing Scholarship",
      deadline: "2026-11-30",
      state: "published",
    },
  ];
  const exact = reconcileIntakeIdentity(
    {
      identity: "Autumn 2026",
      title: "Smart Manufacturing Scholarship",
      deadline: "2026-11-30",
    },
    existing,
    { now },
  );
  assert.equal(exact.relationship, "SAME_EDITION");
  assert.equal(exact.canonical, "2026-fall");
  assert.equal(exact.confidence, 1);
  assert.equal(exact.matchedOfferingId, "offering-fall-2026");

  const alias = reconcileIntakeIdentity(
    {
      identity: "Fall 2026",
      title: "Smart Manufacturing Scholarship",
      deadline: "2026-11-30",
    },
    existing,
    { now },
  );
  assert.equal(alias.relationship, "SAME_EDITION");
  assert.equal(alias.canonical, "2026-fall");
  assert.ok(alias.confidence < 1 && alias.confidence >= 0.9);
  assert.ok(alias.reasons.includes("alias_equivalent_term"));
});

test("a later cycle is a new cycle and an earlier cycle is historical", () => {
  const existing = [
    {
      id: "offering-fall-2026",
      identity: "Fall 2026",
      title: "Smart Manufacturing Scholarship",
      deadline: "2026-11-30",
      state: "published",
    },
  ];
  const next = reconcileIntakeIdentity(
    {
      identity: "Fall 2027",
      title: "Smart Manufacturing Scholarship",
      deadline: "2027-11-30",
    },
    existing,
    { now },
  );
  assert.equal(next.relationship, "NEW_CYCLE");
  assert.equal(next.canonical, "2027-fall");
  assert.ok(next.confidence > 0.8);

  const previous = reconcileIntakeIdentity(
    {
      identity: "Fall 2025",
      title: "Smart Manufacturing Scholarship",
      deadline: "2025-11-30",
    },
    existing,
    { now },
  );
  assert.equal(previous.relationship, "PREVIOUS_CYCLE");
  assert.equal(previous.canonical, "2025-fall");
});

test("ambiguous evidence is escalated for operator review", () => {
  const unstated = reconcileIntakeIdentity(
    { identity: "Scholarship 2027 intake", title: "Programme" },
    [
      {
        id: "offering-1",
        identity: "Fall 2026",
        title: "Programme",
        state: "published",
      },
    ],
    { now },
  );
  assert.equal(unstated.relationship, "AMBIGUOUS");
  assert.equal(unstated.canonical, null);
  assert.ok(unstated.reasons.includes("unstated_or_unparseable_term"));

  const noComparator = reconcileIntakeIdentity(
    { identity: "Fall 2027", title: "Programme" },
    [],
    { now },
  );
  assert.equal(noComparator.relationship, "AMBIGUOUS");
  assert.ok(noComparator.reasons.includes("no_comparable_offering"));

  const duplicates = reconcileIntakeIdentity(
    { identity: "Fall 2026", title: "Programme" },
    [
      {
        id: "a",
        identity: "Autumn 2026",
        title: "Programme",
        state: "published",
      },
      {
        id: "b",
        identity: "Fall 2026",
        title: "Programme",
        state: "published",
      },
    ],
    { now },
  );
  assert.equal(duplicates.relationship, "AMBIGUOUS");
  assert.ok(duplicates.reasons.includes("duplicate_canonical_offering"));

  const differentProgram = reconcileIntakeIdentity(
    { identity: "Fall 2027", title: "Marine Biology Scholarship" },
    [
      {
        id: "a",
        identity: "Fall 2026",
        title: "Smart Manufacturing Scholarship",
        state: "published",
      },
    ],
    { now },
  );
  assert.equal(differentProgram.relationship, "AMBIGUOUS");
  assert.ok(differentProgram.reasons.includes("different_program"));
});

test("draft offerings are ignored unless explicitly included", () => {
  const drafts = [
    {
      id: "draft-1",
      identity: "Fall 2026",
      title: "Smart Manufacturing Scholarship",
      state: "draft",
    },
  ];
  const ignored = reconcileIntakeIdentity(
    { identity: "Fall 2027", title: "Smart Manufacturing Scholarship" },
    drafts,
    { now },
  );
  assert.equal(ignored.relationship, "AMBIGUOUS");
  assert.ok(ignored.reasons.includes("no_comparable_offering"));
  const included = reconcileIntakeIdentity(
    { identity: "Fall 2027", title: "Smart Manufacturing Scholarship" },
    drafts,
    { now, includeDrafts: true },
  );
  assert.equal(included.relationship, "NEW_CYCLE");
});

test("expired editions are noted and evaluation stays deterministic", () => {
  const existing = [
    {
      id: "offering-fall-2026",
      identity: "Autumn 2026",
      title: "Smart Manufacturing Scholarship",
      deadline: "2026-01-31",
      state: "closed",
    },
  ];
  const expired = reconcileIntakeIdentity(
    {
      identity: "Autumn 2026",
      title: "Smart Manufacturing Scholarship",
      deadline: "2026-01-31",
    },
    existing,
    { now },
  );
  assert.equal(expired.relationship, "SAME_EDITION");
  assert.ok(expired.reasons.includes("existing_edition_expired"));
  assert.deepEqual(
    reconcileIntakeIdentity(
      {
        identity: "Autumn 2026",
        title: "Smart Manufacturing Scholarship",
        deadline: "2026-01-31",
      },
      existing,
      { now },
    ),
    expired,
  );
  const safe = reconcileIntakeIdentity(null, null, { now });
  assert.equal(safe.relationship, "AMBIGUOUS");
  assert.equal(safe.confidence, 0);
});

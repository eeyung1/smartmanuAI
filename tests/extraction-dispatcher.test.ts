import test from "node:test";
import assert from "node:assert/strict";
import { fixtureDetails } from "../src/catalogue/fixtures";
import {
  candidateDedupeKey,
  createExtractionDispatcher,
  evaluateExtractionEligibility,
} from "../src/research/extraction-dispatcher";

const now = new Date("2026-11-10T00:00:00.000Z");
const content =
  "Smart manufacturing scholarship for international applicants. Full tuition and living costs are covered. Apply by 2027-03-01.";

const validDetails = {
  ...fixtureDetails,
  title: "Smart manufacturing scholarship",
  funding: "fully_funded" as const,
  deadline: "2027-03-01",
};

const validEvidence = {
  title: { quote: "Smart manufacturing scholarship", reason: null },
  funding: {
    quote: "Full tuition and living costs are covered.",
    reason: null,
  },
  deadline: { quote: "Apply by 2027-03-01", reason: null },
  eligibility: { quote: null, reason: "Not stated." },
};

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  id: "snapshot-1",
  sourceId: "source-1",
  contentHash: "hash-1",
  content,
  ...overrides,
});

function dispatcher(overrides = {}) {
  let counter = 0;
  return createExtractionDispatcher({
    now,
    idFactory: () => `record-${++counter}`,
    ...overrides,
  });
}

test("eligibility depends on content hash, progress, quota and budget", () => {
  const fresh = evaluateExtractionEligibility(snapshot(), { now });
  assert.equal(fresh.eligible, true);
  assert.equal(fresh.state, "PENDING_EXTRACTION");
  assert.equal(fresh.reason, "extraction_required");
  assert.equal(fresh.estimatedCostMicrodollars, "2000");
  assert.equal(fresh.spendStatus, "NORMAL");

  const unchanged = evaluateExtractionEligibility(snapshot(), {
    now,
    extractedHashBySource: { "source-1": "hash-1" },
  });
  assert.equal(unchanged.eligible, false);
  assert.equal(unchanged.state, "SKIPPED_UNCHANGED");
  assert.equal(unchanged.reason, "unchanged_content");

  const inProgress = evaluateExtractionEligibility(snapshot(), {
    now,
    inProgressSnapshotIds: ["snapshot-1"],
  });
  assert.equal(inProgress.eligible, false);
  assert.equal(inProgress.reason, "extraction_in_progress");

  const quota = evaluateExtractionEligibility(snapshot(), {
    now,
    minIntervalMs: 3_600_000,
    lastExtractionAtBySource: { "source-1": now.getTime() - 60_000 },
  });
  assert.equal(quota.eligible, false);
  assert.equal(quota.reason, "rate_quota_window");
  assert.equal(quota.state, "PENDING_EXTRACTION");
});

test("spending guards refuse dispatch when the budget is throttled or exhausted", () => {
  const spent = (microdollars: number) => [
    {
      occurredAt: "2026-11-05T00:00:00.000Z",
      category: "ai_tokens",
      microdollars,
    },
  ];
  const throttled = evaluateExtractionEligibility(snapshot(), {
    now,
    usageRecords: spent(28_000_000),
    budgetMicrodollars: 30_000_000,
  });
  assert.equal(throttled.eligible, false);
  assert.equal(throttled.reason, "budget_throttled");
  assert.equal(throttled.spendStatus, "THROTTLE");

  const hardStop = evaluateExtractionEligibility(snapshot(), {
    now,
    usageRecords: spent(30_000_000),
    budgetMicrodollars: 30_000_000,
  });
  assert.equal(hardStop.eligible, false);
  assert.equal(hardStop.reason, "budget_hard_stop");
  assert.equal(hardStop.spendStatus, "HARD_STOP");

  const exhausted = evaluateExtractionEligibility(snapshot(), {
    now,
    usageRecords: spent(26_000_000),
    budgetMicrodollars: 30_000_000,
    estimatedCostMicrodollars: 5_000_000,
  });
  assert.equal(exhausted.eligible, false);
  assert.equal(exhausted.reason, "budget_exhausted");
});

test("malformed and empty snapshots fail safely", () => {
  for (const invalid of [null, undefined, {}, { id: "x" }]) {
    const result = evaluateExtractionEligibility(invalid, { now });
    assert.equal(result.eligible, false);
    assert.equal(result.state, "FAILED");
    assert.equal(result.reason, "malformed_snapshot");
  }
  const empty = evaluateExtractionEligibility(snapshot({ content: "   " }), {
    now,
  });
  assert.equal(empty.eligible, false);
  assert.equal(empty.reason, "empty_content");
});

test("the dispatch lifecycle records state, field counts and confidence", () => {
  const coordinator = dispatcher({ knownCandidateKeys: ["duplicate-key"] });
  const requested = coordinator.requestExtraction(snapshot());
  assert.equal(requested.granted, true);
  const recordId = requested.record!.id;
  assert.equal(requested.record!.state, "PENDING_EXTRACTION");

  const begun = coordinator.beginExtraction(recordId);
  assert.equal(begun.ok, true);
  assert.equal(begun.record!.state, "EXTRACTING");

  const details = validDetails;
  const completed = coordinator.completeExtraction(recordId, {
    relevant: true,
    details,
    evidence: validEvidence,
    candidates: [
      { key: candidateDedupeKey("source-1", details.title) },
      { key: "duplicate-key" },
    ],
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.record!.state, "COMPLETED");
  assert.equal(completed.record!.candidates, 1);
  assert.equal(completed.record!.duplicateCandidates, 1);
  assert.ok(completed.record!.fieldsExtracted > 0);
  assert.equal(completed.record!.fieldsTotal, 9);
  assert.ok(
    completed.record!.confidence > 0 && completed.record!.confidence <= 1,
  );
  assert.equal(coordinator.summary(recordId)?.state, "COMPLETED");
});

test("schema failures are rejected and candidates deduplicate across snapshots", () => {
  const coordinator = dispatcher({
    knownCandidateKeys: ["already-known"],
  });
  const first = coordinator.requestExtraction(snapshot());
  coordinator.beginExtraction(first.record!.id);
  const rejected = coordinator.completeExtraction(first.record!.id, {
    relevant: true,
    details: { title: "Missing required fields" },
    evidence: {
      title: { quote: null, reason: "Not stated." },
      funding: { quote: null, reason: "Not stated." },
      deadline: { quote: null, reason: "Not stated." },
      eligibility: { quote: null, reason: "Not stated." },
    },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.record!.state, "REJECTED_SCHEMA");

  const second = coordinator.requestExtraction(
    snapshot({ id: "snapshot-2", contentHash: "hash-2" }),
  );
  coordinator.beginExtraction(second.record!.id);
  const details = validDetails;
  const completed = coordinator.completeExtraction(second.record!.id, {
    relevant: true,
    details,
    evidence: validEvidence,
    candidates: [{ key: "already-known" }, { key: "fresh-key" }],
  });
  assert.equal(completed.record!.candidates, 1);
  assert.equal(completed.record!.duplicateCandidates, 1);
  assert.equal(
    coordinator.evaluate(snapshot({ id: "snapshot-3", contentHash: "hash-2" }))
      .reason,
    "unchanged_content",
    "the extracted hash is remembered per source",
  );
});

test("failed extractions release the in-progress slot", () => {
  const coordinator = dispatcher();
  const requested = coordinator.requestExtraction(snapshot());
  coordinator.beginExtraction(requested.record!.id);
  const failed = coordinator.failExtraction(
    requested.record!.id,
    new Error("model timeout"),
  );
  assert.equal(failed.record!.state, "FAILED");
  assert.match(String(failed.record!.reason), /model timeout/);
  assert.equal(
    coordinator.evaluate(snapshot({ id: "snapshot-1", contentHash: "hash-2" }))
      .reason,
    "extraction_required",
  );
});

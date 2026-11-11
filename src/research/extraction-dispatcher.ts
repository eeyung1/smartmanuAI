import { createHash, randomUUID } from "node:crypto";
import {
  calculateMonthlySpending,
  type SpendStatus,
} from "../admin/spending-meter";
import { researchExtractionSchema, validateExtraction } from "./extraction";

export type ExtractionDispatchState =
  | "PENDING_EXTRACTION"
  | "EXTRACTING"
  | "COMPLETED"
  | "SKIPPED_UNCHANGED"
  | "REJECTED_SCHEMA"
  | "FAILED";

export type ExtractionSnapshot = {
  id: string;
  sourceId: string;
  contentHash: string;
  content?: string;
  fetchedAt?: string | number | Date;
};

export type ExtractionCandidateInput = {
  key: string;
  title?: string | null;
};

export type ExtractionResultInput = {
  relevant?: boolean;
  details?: Record<string, unknown> | null;
  evidence?: Record<string, unknown>;
  candidates?: readonly ExtractionCandidateInput[];
  confidence?: number;
};

export type ExtractionDispatchOptions = {
  now?: Date;
  usageRecords?: readonly unknown[];
  budgetMicrodollars?: number;
  estimatedCostMicrodollars?: number;
  /** Latest content hash already extracted for each source. */
  extractedHashBySource?: Record<string, string>;
  /** Timestamp of the last extraction for each source. */
  lastExtractionAtBySource?: Record<string, number>;
  /** Minimum interval between two extractions of the same source. */
  minIntervalMs?: number;
  /** Snapshots whose extraction is already running. */
  inProgressSnapshotIds?: readonly string[];
  /** Deduplication keys of candidates already stored. */
  knownCandidateKeys?: readonly string[];
};

export type ExtractionEligibility = {
  eligible: boolean;
  state: ExtractionDispatchState;
  reason: string;
  snapshotId: string;
  sourceId: string;
  contentHash: string;
  spendStatus: SpendStatus | null;
  estimatedCostMicrodollars: string;
  reservedMicrodollars: string;
};

export type ExtractionSummary = {
  snapshotId: string;
  sourceId: string;
  state: ExtractionDispatchState;
  relevant: boolean;
  reason: string;
  fieldsExtracted: number;
  fieldsTotal: number;
  evidenceQuotes: number;
  candidates: number;
  duplicateCandidates: number;
  confidence: number;
  reservedMicrodollars: string;
};

export type ExtractionRecord = ExtractionSummary & {
  id: string;
  createdAt: number;
  updatedAt: number;
  contentHash: string;
};

const DEFAULT_ESTIMATED_COST_MICRODOLLARS = 2_000;
const EXPECTED_DETAIL_FIELDS = [
  "title",
  "organizer",
  "summary",
  "category",
  "mode",
  "teachingLanguage",
  "topics",
  "funding",
  "deadline",
] as const;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function countFields(details: Record<string, unknown> | null) {
  if (!details) return 0;
  return EXPECTED_DETAIL_FIELDS.filter((field) => {
    const value = details[field];
    return value !== undefined && value !== null;
  }).length;
}

function confidenceFrom(
  fieldsExtracted: number,
  quotes: number,
  explicit?: number,
) {
  if (typeof explicit === "number" && Number.isFinite(explicit))
    return round2(Math.min(1, Math.max(0, explicit)));
  const fieldCoverage = fieldsExtracted / EXPECTED_DETAIL_FIELDS.length;
  const evidenceCoverage = Math.min(1, quotes / 4);
  return round2(0.5 * fieldCoverage + 0.5 * evidenceCoverage);
}

/**
 * Decides whether a harvested snapshot should be sent to the extractor.
 * The evaluation is deterministic and never throws for malformed input.
 */
export function evaluateExtractionEligibility(
  snapshot: unknown,
  options: ExtractionDispatchOptions = {},
): ExtractionEligibility {
  const now = options.now ?? new Date();
  const reference = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const estimate =
    options.estimatedCostMicrodollars ?? DEFAULT_ESTIMATED_COST_MICRODOLLARS;
  const estimated =
    Number.isSafeInteger(estimate) && estimate >= 0 ? estimate : 0;
  const base = {
    snapshotId: "",
    sourceId: "",
    contentHash: "",
    spendStatus: null as SpendStatus | null,
    estimatedCostMicrodollars: String(estimated),
    reservedMicrodollars: "0",
  };
  const record = snapshot as ExtractionSnapshot | null;
  const id = text(record?.id);
  const sourceId = text(record?.sourceId);
  const contentHash = text(record?.contentHash);
  if (!id || !sourceId || !contentHash)
    return {
      ...base,
      eligible: false,
      state: "FAILED",
      reason: "malformed_snapshot",
    };
  const content = typeof record?.content === "string" ? record.content : null;
  if (content !== null && !content.trim())
    return {
      ...base,
      snapshotId: id,
      sourceId,
      contentHash,
      eligible: false,
      state: "FAILED",
      reason: "empty_content",
    };

  const spend = calculateMonthlySpending(options.usageRecords ?? [], {
    ...(options.budgetMicrodollars === undefined
      ? {}
      : { budgetMicrodollars: options.budgetMicrodollars }),
    now,
  });
  const withSpend = {
    ...base,
    snapshotId: id,
    sourceId,
    contentHash,
    spendStatus: spend.status,
  };
  if (spend.status === "HARD_STOP")
    return {
      ...withSpend,
      eligible: false,
      state: "FAILED",
      reason: "budget_hard_stop",
    };
  if (spend.status === "THROTTLE")
    return {
      ...withSpend,
      eligible: false,
      state: "FAILED",
      reason: "budget_throttled",
    };

  if (options.extractedHashBySource?.[sourceId] === contentHash)
    return {
      ...withSpend,
      eligible: false,
      state: "SKIPPED_UNCHANGED",
      reason: "unchanged_content",
    };
  if (options.inProgressSnapshotIds?.includes(id))
    return {
      ...withSpend,
      eligible: false,
      state: "EXTRACTING",
      reason: "extraction_in_progress",
    };
  const lastExtraction = options.lastExtractionAtBySource?.[sourceId];
  const minInterval = options.minIntervalMs ?? 0;
  if (
    typeof lastExtraction === "number" &&
    Number.isFinite(lastExtraction) &&
    minInterval > 0 &&
    reference - lastExtraction < minInterval
  )
    return {
      ...withSpend,
      eligible: false,
      state: "PENDING_EXTRACTION",
      reason: "rate_quota_window",
    };
  const projected = BigInt(spend.totalMicrodollars) + BigInt(estimated);
  if (
    BigInt(spend.budgetMicrodollars) > 0n &&
    projected > BigInt(spend.budgetMicrodollars)
  )
    return {
      ...withSpend,
      eligible: false,
      state: "FAILED",
      reason: "budget_exhausted",
    };
  return {
    ...withSpend,
    eligible: true,
    state: "PENDING_EXTRACTION",
    reason: "extraction_required",
  };
}

/** Coordinates extraction lifecycle, reservations and candidate deduplication. */
export function createExtractionDispatcher(
  options: ExtractionDispatchOptions & { idFactory?: () => string } = {},
) {
  const idFactory = options.idFactory ?? (() => randomUUID());
  const records = new Map<string, ExtractionRecord>();
  const candidateKeys = new Set(options.knownCandidateKeys ?? []);
  const extractedHashBySource: Record<string, string> = {
    ...(options.extractedHashBySource ?? {}),
  };
  const lastExtractionAtBySource: Record<string, number> = {
    ...(options.lastExtractionAtBySource ?? {}),
  };
  const inProgress = new Set<string>(options.inProgressSnapshotIds ?? []);
  const contents = new Map<string, string>();

  const evaluate = (
    snapshot: unknown,
    override: ExtractionDispatchOptions = {},
  ) =>
    evaluateExtractionEligibility(snapshot, {
      ...options,
      extractedHashBySource,
      lastExtractionAtBySource,
      inProgressSnapshotIds: [...inProgress],
      ...override,
    });

  const requestExtraction = (snapshot: unknown) => {
    const eligibility = evaluate(snapshot);
    if (!eligibility.eligible)
      return { granted: false, reason: eligibility.reason, record: null };
    const record: ExtractionRecord = {
      id: idFactory(),
      snapshotId: eligibility.snapshotId,
      sourceId: eligibility.sourceId,
      contentHash: eligibility.contentHash,
      state: "PENDING_EXTRACTION",
      relevant: false,
      reason: eligibility.reason,
      fieldsExtracted: 0,
      fieldsTotal: 0,
      evidenceQuotes: 0,
      candidates: 0,
      duplicateCandidates: 0,
      confidence: 0,
      reservedMicrodollars: eligibility.estimatedCostMicrodollars,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    records.set(record.id, record);
    inProgress.add(eligibility.snapshotId);
    const captured = snapshot as ExtractionSnapshot | null;
    if (typeof captured?.content === "string")
      contents.set(eligibility.snapshotId, captured.content);
    return {
      granted: true,
      reason: "extraction_scheduled",
      record: { ...record },
    };
  };

  const beginExtraction = (recordId: string) => {
    const record = records.get(recordId);
    if (!record) return { ok: false, reason: "unknown_record", record: null };
    if (record.state !== "PENDING_EXTRACTION")
      return { ok: false, reason: "not_pending", record: { ...record } };
    record.state = "EXTRACTING";
    record.updatedAt = Date.now();
    return { ok: true, reason: "extracting", record: { ...record } };
  };

  const completeExtraction = (recordId: string, result: unknown) => {
    const record = records.get(recordId);
    if (!record) return { ok: false, reason: "unknown_record", record: null };
    if (record.state !== "EXTRACTING")
      return { ok: false, reason: "not_extracting", record: { ...record } };
    const value = (result ?? {}) as ExtractionResultInput;
    const content = contents.get(record.snapshotId) ?? null;
    // The reviewed schema is strict, so dispatcher-only fields are removed
    // before the extraction payload is validated.
    const payload = {
      relevant: value.relevant !== false,
      details: value.details ?? null,
      evidence: value.evidence ?? {},
    };
    try {
      if (content !== null) validateExtraction(content, payload);
      else if (!researchExtractionSchema.safeParse(payload).success)
        throw new Error("Extraction does not match the reviewed schema.");
    } catch (error) {
      record.state = "REJECTED_SCHEMA";
      record.reason =
        error instanceof Error
          ? error.message.slice(0, 300)
          : "schema_rejected";
      record.updatedAt = Date.now();
      inProgress.delete(record.snapshotId);
      return { ok: false, reason: "schema_rejected", record: { ...record } };
    }
    const details =
      value.details && typeof value.details === "object" ? value.details : null;
    const evidence = value.evidence ?? {};
    const quotes = Object.values(evidence).filter((field) => {
      if (!field || typeof field !== "object") return false;
      return typeof (field as { quote?: unknown }).quote === "string";
    }).length;
    const fields = countFields(details);
    let candidates = 0;
    let duplicates = 0;
    for (const candidate of value.candidates ?? []) {
      const key = text(candidate?.key);
      if (!key) continue;
      if (candidateKeys.has(key)) {
        duplicates++;
        continue;
      }
      candidateKeys.add(key);
      candidates++;
    }
    record.state = "COMPLETED";
    record.relevant = value.relevant !== false;
    record.fieldsExtracted = countFields(details);
    record.fieldsTotal = EXPECTED_DETAIL_FIELDS.length;
    record.evidenceQuotes = quotes;
    record.candidates = candidates;
    record.duplicateCandidates = duplicates;
    record.confidence = confidenceFrom(
      record.fieldsExtracted,
      quotes,
      value.confidence,
    );
    record.reason = "extraction_completed";
    record.updatedAt = Date.now();
    extractedHashBySource[record.sourceId] = record.contentHash;
    lastExtractionAtBySource[record.sourceId] = record.updatedAt;
    inProgress.delete(record.snapshotId);
    return { ok: true, reason: "completed", record: { ...record } };
  };

  const failExtraction = (recordId: string, error: unknown) => {
    const record = records.get(recordId);
    if (!record) return { ok: false, reason: "unknown_record", record: null };
    record.state = "FAILED";
    record.reason =
      error instanceof Error
        ? error.message.slice(0, 300)
        : "extraction_failed";
    record.updatedAt = Date.now();
    inProgress.delete(record.snapshotId);
    return { ok: true, reason: "failed", record: { ...record } };
  };

  const summary = (recordId: string) => {
    const record = records.get(recordId);
    return record ? { ...record } : null;
  };

  return {
    evaluate,
    requestExtraction,
    beginExtraction,
    completeExtraction,
    failExtraction,
    summary,
    records: () => [...records.values()].map((record) => ({ ...record })),
    candidateKeys: () => [...candidateKeys],
    extractedHashBySource: () => ({ ...extractedHashBySource }),
  };
}

/** Stable dedupe key for an extracted candidate. */
export function candidateDedupeKey(
  sourceId: string,
  title: string | null | undefined,
) {
  return createHash("sha256")
    .update(`${sourceId.trim().toLowerCase()}|${text(title).toLowerCase()}`)
    .digest("hex");
}

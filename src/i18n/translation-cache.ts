import { createHash } from "node:crypto";
import type { Locale } from "./locale";

export const SUPPORTED_TRANSLATION_LOCALES = ["en", "zh-Hans"] as const;
export type TranslationLocale = (typeof SUPPORTED_TRANSLATION_LOCALES)[number];

export type TranslationFieldKey =
  "title" | "summary" | "organizer" | "eligibility" | "fundingNote";

export type TranslationPayload = Partial<Record<TranslationFieldKey, string>> &
  Record<string, string>;

export type CachedTranslation = {
  opportunityId: string;
  locale: TranslationLocale;
  sourceContentHash: string;
  payload: TranslationPayload;
  model: string | null;
  reviewer: string | null;
  reviewed: boolean;
  createdAt: number;
  status: "active" | "stale" | "invalidated";
};

export type TranslationCacheOptions = {
  now?: () => number;
  /** Reject machine output that has not been reviewed. */
  requireReview?: boolean;
};

export type TranslationLookup = {
  status: "hit" | "miss" | "stale";
  translation: CachedTranslation | null;
  reason: string;
};

export type CacheTranslationResult = {
  ok: boolean;
  reason: string;
  translation: CachedTranslation | null;
};

export type InvalidationResult = {
  ok: boolean;
  reason: string;
  invalidated: number;
  stale: number;
  opportunityId: string;
  newContentHash: string;
};

const MAX_PAYLOAD_LENGTH = 4_000;
const MAX_FIELD_LENGTH = 2_000;

function isLocale(value: unknown): value is TranslationLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_TRANSLATION_LOCALES as readonly string[]).includes(value)
  );
}

function isContentHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{16,128}$/.test(value.trim());
}

function identifier(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

function normalizePayload(value: unknown): {
  payload: TranslationPayload | null;
  reason: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { payload: null, reason: "invalid_payload" };
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return { payload: null, reason: "empty_payload" };
  const payload: TranslationPayload = {};
  for (const [key, entry] of entries) {
    if (typeof entry !== "string")
      return { payload: null, reason: "invalid_payload" };
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > MAX_FIELD_LENGTH)
      return { payload: null, reason: "invalid_payload" };
    payload[key] = trimmed;
  }
  const size = JSON.stringify(payload).length;
  if (size > MAX_PAYLOAD_LENGTH)
    return { payload: null, reason: "payload_too_large" };
  return { payload, reason: "ok" };
}

/**
 * Caches reviewed opportunity translations per source content hash so that a
 * changed source revision cannot silently reuse an outdated translation.
 */
export function createOpportunityTranslationCache(
  options: TranslationCacheOptions = {},
) {
  const now = options.now ?? (() => Date.now());
  const requireReview = options.requireReview === true;
  const entries = new Map<string, CachedTranslation>();

  const key = (opportunityId: string, locale: string) =>
    `${opportunityId}::${locale}`;

  const getOpportunityTranslation = (
    opportunityId: unknown,
    targetLocale: unknown,
    sourceContentHash: unknown,
  ): TranslationLookup => {
    const id = identifier(opportunityId);
    if (!id)
      return {
        status: "miss",
        translation: null,
        reason: "invalid_opportunity",
      };
    if (!isLocale(targetLocale))
      return {
        status: "miss",
        translation: null,
        reason: "unsupported_locale",
      };
    if (!isContentHash(sourceContentHash))
      return {
        status: "miss",
        translation: null,
        reason: "invalid_content_hash",
      };
    const entry = entries.get(key(id, targetLocale));
    if (!entry)
      return { status: "miss", translation: null, reason: "not_cached" };
    if (entry.status === "invalidated")
      return {
        status: "miss",
        translation: { ...entry },
        reason: "invalidated",
      };
    if (entry.sourceContentHash !== sourceContentHash.trim())
      return {
        status: "stale",
        translation: { ...entry },
        reason: "stale_source",
      };
    if (entry.status === "stale")
      return {
        status: "stale",
        translation: { ...entry },
        reason: "stale_source",
      };
    return { status: "hit", translation: { ...entry }, reason: "cached" };
  };

  const cacheOpportunityTranslation = (
    opportunityId: unknown,
    targetLocale: unknown,
    sourceContentHash: unknown,
    translationPayload: unknown,
    cacheOptions: {
      model?: string | null;
      reviewer?: string | null;
      reviewed?: boolean;
      requireReview?: boolean;
    } = {},
  ): CacheTranslationResult => {
    const id = identifier(opportunityId);
    if (!id)
      return { ok: false, reason: "invalid_opportunity", translation: null };
    if (!isLocale(targetLocale))
      return { ok: false, reason: "unsupported_locale", translation: null };
    if (!isContentHash(sourceContentHash))
      return { ok: false, reason: "invalid_content_hash", translation: null };
    const { payload, reason } = normalizePayload(translationPayload);
    if (!payload) return { ok: false, reason, translation: null };
    const reviewer = identifier(cacheOptions.reviewer ?? null);
    const model = identifier(cacheOptions.model ?? null);
    const reviewed =
      cacheOptions.reviewed === true ||
      (reviewer !== null && cacheOptions.reviewed !== false);
    const strictReview = cacheOptions.requireReview ?? requireReview;
    if (strictReview && !reviewed)
      return {
        ok: false,
        reason: "review_required",
        translation: null,
      };
    if (reviewed && reviewer === null)
      return { ok: false, reason: "reviewer_required", translation: null };
    const existing = entries.get(key(id, targetLocale));
    const translation: CachedTranslation = {
      opportunityId: id,
      locale: targetLocale,
      sourceContentHash: sourceContentHash.trim(),
      payload,
      model,
      reviewer,
      reviewed,
      createdAt: existing?.createdAt ?? now(),
      status: "active",
    };
    entries.set(key(id, targetLocale), translation);
    return { ok: true, reason: "cached", translation: { ...translation } };
  };

  const invalidateTranslations = (
    opportunityId: unknown,
    newContentHash: unknown,
    invalidateOptions: { markStale?: boolean } = {},
  ): InvalidationResult => {
    const id = identifier(opportunityId);
    if (!id)
      return {
        ok: false,
        reason: "invalid_opportunity",
        invalidated: 0,
        stale: 0,
        opportunityId: "",
        newContentHash: "",
      };
    if (!isContentHash(newContentHash))
      return {
        ok: false,
        reason: "invalid_content_hash",
        invalidated: 0,
        stale: 0,
        opportunityId: id,
        newContentHash: "",
      };
    let invalidated = 0;
    let stale = 0;
    for (const [entryKey, entry] of entries) {
      if (entry.opportunityId !== id) continue;
      if (entry.sourceContentHash === newContentHash.trim()) continue;
      if (invalidateOptions.markStale === true) {
        entry.status = "stale";
        stale++;
      } else {
        entry.status = "invalidated";
        invalidated++;
      }
      entries.set(entryKey, entry);
    }
    return {
      ok: true,
      reason: "invalidated",
      invalidated,
      stale,
      opportunityId: id,
      newContentHash: newContentHash.trim(),
    };
  };

  return {
    getOpportunityTranslation,
    cacheOpportunityTranslation,
    invalidateTranslations,
    entries: () => [...entries.values()].map((entry) => ({ ...entry })),
    reference(
      opportunityId: string,
      locale: string,
      sourceContentHash: string,
    ) {
      return createHash("sha256")
        .update(
          `translation-cache-v1:${opportunityId}|${locale}|${sourceContentHash}`,
        )
        .digest("hex")
        .slice(0, 16);
    },
  };
}

export type OpportunityTranslationCache = ReturnType<
  typeof createOpportunityTranslationCache
>;

let defaultCache: OpportunityTranslationCache | null = null;

export function opportunityTranslationCache(
  options: TranslationCacheOptions = {},
) {
  defaultCache ??= createOpportunityTranslationCache(options);
  return defaultCache;
}

export function getOpportunityTranslation(
  opportunityId: string,
  targetLocale: Locale | string,
  sourceContentHash: string,
  options: TranslationCacheOptions = {},
) {
  return opportunityTranslationCache(options).getOpportunityTranslation(
    opportunityId,
    targetLocale,
    sourceContentHash,
  );
}

export function cacheOpportunityTranslation(
  opportunityId: string,
  targetLocale: Locale | string,
  sourceContentHash: string,
  translationPayload: TranslationPayload,
  options: TranslationCacheOptions & {
    model?: string | null;
    reviewer?: string | null;
    reviewed?: boolean;
    requireReview?: boolean;
  } = {},
) {
  return opportunityTranslationCache(options).cacheOpportunityTranslation(
    opportunityId,
    targetLocale,
    sourceContentHash,
    translationPayload,
    options,
  );
}

export function invalidateTranslations(
  opportunityId: string,
  newContentHash: string,
  options: TranslationCacheOptions & { markStale?: boolean } = {},
) {
  return opportunityTranslationCache(options).invalidateTranslations(
    opportunityId,
    newContentHash,
    options,
  );
}

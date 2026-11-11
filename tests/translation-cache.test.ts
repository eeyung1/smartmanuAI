import test from "node:test";
import assert from "node:assert/strict";
import { createOpportunityTranslationCache } from "../src/i18n/translation-cache";

const hash = "a".repeat(64);
const nextHash = "b".repeat(64);

function cacheAt(start = 1_000_000) {
  let now = start;
  const cache = createOpportunityTranslationCache({ now: () => now });
  return { cache, advance: (ms: number) => (now += ms) };
}

test("a cached translation is returned for the same content hash", () => {
  const { cache } = cacheAt();
  const stored = cache.cacheOpportunityTranslation(
    "opportunity-1",
    "zh-Hans",
    hash,
    { title: "智能制造奖学金", summary: "资助学费与生活费。" },
    { model: "fixture-model", reviewer: "reviewer-1", reviewed: true },
  );
  assert.equal(stored.ok, true);
  assert.equal(stored.translation?.status, "active");
  assert.equal(stored.translation?.reviewed, true);
  assert.equal(stored.translation?.reviewer, "reviewer-1");
  assert.equal(stored.translation?.sourceContentHash, hash);

  const found = cache.getOpportunityTranslation(
    "opportunity-1",
    "zh-Hans",
    hash,
  );
  assert.equal(found.status, "hit");
  assert.equal(found.translation?.payload.title, "智能制造奖学金");
  assert.equal(found.reason, "cached");
});

test("changed content hashes produce a miss or a stale entry", () => {
  const { cache } = cacheAt();
  cache.cacheOpportunityTranslation(
    "opportunity-1",
    "zh-Hans",
    hash,
    { title: "智能制造奖学金" },
    { reviewer: "reviewer-1", reviewed: true },
  );
  const stale = cache.getOpportunityTranslation(
    "opportunity-1",
    "zh-Hans",
    nextHash,
  );
  assert.equal(stale.status, "stale");
  assert.equal(stale.reason, "stale_source");
  assert.equal(stale.translation?.sourceContentHash, hash);

  const miss = cache.getOpportunityTranslation(
    "opportunity-2",
    "zh-Hans",
    hash,
  );
  assert.equal(miss.status, "miss");
  assert.equal(miss.reason, "not_cached");
});

test("invalidation invalidates or marks translations stale", () => {
  const { cache } = cacheAt();
  cache.cacheOpportunityTranslation(
    "opportunity-1",
    "zh-Hans",
    hash,
    { title: "旧标题" },
    { reviewer: "reviewer-1", reviewed: true },
  );
  cache.cacheOpportunityTranslation(
    "opportunity-1",
    "en",
    hash,
    { title: "Old title" },
    { reviewer: "reviewer-1", reviewed: true },
  );
  cache.cacheOpportunityTranslation(
    "opportunity-2",
    "zh-Hans",
    hash,
    { title: "其他机会" },
    { reviewer: "reviewer-1", reviewed: true },
  );

  const invalidated = cache.invalidateTranslations("opportunity-1", nextHash);
  assert.equal(invalidated.ok, true);
  assert.equal(invalidated.invalidated, 2);
  assert.equal(invalidated.stale, 0);
  assert.equal(
    cache.getOpportunityTranslation("opportunity-1", "zh-Hans", hash).status,
    "miss",
  );
  assert.equal(
    cache.getOpportunityTranslation("opportunity-1", "zh-Hans", hash).reason,
    "invalidated",
  );
  assert.equal(
    cache.getOpportunityTranslation("opportunity-2", "zh-Hans", hash).status,
    "hit",
    "other opportunities are untouched",
  );

  const marked = cacheAt();
  marked.cache.cacheOpportunityTranslation(
    "opportunity-3",
    "zh-Hans",
    hash,
    { title: "旧标题" },
    { reviewer: "reviewer-1", reviewed: true },
  );
  const staleResult = marked.cache.invalidateTranslations(
    "opportunity-3",
    nextHash,
    { markStale: true },
  );
  assert.equal(staleResult.stale, 1);
  assert.equal(staleResult.invalidated, 0);
  assert.equal(
    marked.cache.getOpportunityTranslation("opportunity-3", "zh-Hans", hash)
      .status,
    "stale",
  );
});

test("unsupported locales and malformed payloads are rejected", () => {
  const { cache } = cacheAt();
  assert.equal(
    cache.getOpportunityTranslation("opportunity-1", "fr", hash).reason,
    "unsupported_locale",
  );
  assert.equal(
    cache.cacheOpportunityTranslation("opportunity-1", "fr", hash, {
      title: "标题",
    }).reason,
    "unsupported_locale",
  );
  assert.equal(
    cache.cacheOpportunityTranslation(
      "opportunity-1",
      "zh-Hans",
      "not-a-hash",
      { title: "标题" },
    ).reason,
    "invalid_content_hash",
  );
  for (const payload of [
    null,
    "text",
    42,
    [],
    { title: 5 },
    {},
    { title: "  " },
  ])
    assert.equal(
      cache.cacheOpportunityTranslation(
        "opportunity-1",
        "zh-Hans",
        hash,
        payload as never,
      ).ok,
      false,
      JSON.stringify(payload),
    );
  assert.equal(
    cache.getOpportunityTranslation("", "zh-Hans", hash).reason,
    "invalid_opportunity",
  );
});

test("strict review refuses unreviewed machine output", () => {
  const strict = cacheAt();
  strict.cache.cacheOpportunityTranslation(
    "opportunity-1",
    "zh-Hans",
    hash,
    { title: "机器翻译" },
    { model: "fixture-model" },
  );
  const strictResult = strict.cache.cacheOpportunityTranslation(
    "opportunity-1",
    "zh-Hans",
    hash,
    { title: "机器翻译" },
    { model: "fixture-model", requireReview: true },
  );
  assert.equal(strictResult.ok, false);
  assert.equal(strictResult.reason, "review_required");

  const reviewed = strict.cache.cacheOpportunityTranslation(
    "opportunity-1",
    "zh-Hans",
    hash,
    { title: "已审核" },
    { model: "fixture-model", reviewer: "reviewer-1", reviewed: true },
  );
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.translation?.reviewed, true);
});

test("caching is deterministic and the reference helper is stable", () => {
  const { cache } = cacheAt();
  cache.cacheOpportunityTranslation(
    "opportunity-1",
    "zh-Hans",
    hash,
    { title: "标题" },
    { reviewer: "reviewer-1", reviewed: true },
  );
  assert.equal(
    cache.reference("opportunity-1", "zh-Hans", hash),
    cache.reference("opportunity-1", "zh-Hans", hash),
  );
  assert.match(
    cache.reference("opportunity-1", "zh-Hans", hash),
    /^[a-f0-9]{16}$/,
  );
  assert.equal(cache.entries().length, 1);
});

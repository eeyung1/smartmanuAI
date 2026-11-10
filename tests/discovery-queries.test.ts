import test from "node:test";
import assert from "node:assert/strict";
import { generateDiscoveryQueries } from "../src/research/discovery-queries";

test("discovery queries span bounded bilingual dimensions with provider syntax", () => {
  const queries = generateDiscoveryQueries({
    institutions: [{ name: "Tsinghua University", domain: "tsinghua.edu.cn" }],
    providers: ["google", "baidu"],
    degreeTiers: ["master"],
    disciplines: ["smart manufacturing", "robotics"],
    intakeYears: [2027],
    maxQueries: 8,
  });
  assert.equal(queries.length, 8);
  assert.equal(new Set(queries.map((query) => query.id)).size, 8);
  assert.ok(
    queries.every((query) => /^discovery-[a-f0-9]{20}$/.test(query.id)),
  );
  assert.ok(
    queries.every((query) => query.query.includes("site:tsinghua.edu.cn")),
  );
  assert.ok(
    queries
      .filter((query) => query.provider === "google")
      .every((query) => query.query.includes("filetype:html")),
  );
  assert.ok(
    queries
      .filter((query) => query.provider === "baidu")
      .every((query) => !query.query.includes("filetype:html")),
  );
  assert.ok(queries.some((query) => /smart manufacturing/.test(query.query)));
  assert.ok(queries.some((query) => /智能制造/.test(query.query)));
  assert.ok(queries.some((query) => /robotics/.test(query.query)));
  assert.ok(queries.some((query) => /机器人/.test(query.query)));
  assert.ok(queries.some((query) => /scholarship/.test(query.query)));
  assert.ok(queries.some((query) => /奖学金/.test(query.query)));
  assert.ok(
    queries.every((query) =>
      ["-consultancy", "-agents", "-commercial", "-recruitment"].every((term) =>
        query.query.includes(term),
      ),
    ),
  );
  assert.ok(queries.every((query) => query.tags.intakeYear === 2027));
  assert.ok(
    queries.every((query) => query.priority >= 1 && query.priority <= 100),
  );
});

test("query generation is deterministic, configurable and stops at its cap", () => {
  const options = {
    institutions: ["University A", "University B"],
    siteDomain: "edu.cn",
    providers: ["bing"] as const,
    degreeTiers: ["bachelor", "doctoral"],
    disciplines: ["robotics"],
    languages: ["en"] as const,
    negativeTerms: ["agency", "jobs"],
    maxQueries: 3,
  };
  const first = generateDiscoveryQueries(options);
  assert.deepEqual(generateDiscoveryQueries(options), first);
  assert.equal(first.length, 3);
  assert.ok(first.every((query) => query.provider === "bing"));
  assert.ok(first.every((query) => /-agency -jobs/.test(query.query)));
  assert.ok(first.every((query) => query.tags.language === "en"));
});

test("invalid discovery inputs are rejected before expansion", () => {
  for (const options of [
    { institutions: [] },
    { institutions: ["University"], providers: ["other"] },
    { institutions: ["University"], languages: [] },
    { institutions: ["University"], intakeYears: [1999] },
    { institutions: ["University"], siteDomain: "https://bad/path" },
    { institutions: ["University"], maxQueries: 0 },
    { institutions: [{ name: "", domain: "school.edu" }] },
  ] as unknown[])
    assert.throws(() => generateDiscoveryQueries(options as never));
});

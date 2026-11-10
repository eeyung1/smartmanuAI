import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ROBOTS_CRAWL_DELAY_SECONDS,
  getCrawlDelaySeconds,
  isUrlAllowed,
  parseRobotsTxt,
} from "../src/research/robots-policy";

test("robots policies select the most specific user-agent groups and path rules", () => {
  const rules = parseRobotsTxt(`
User-agent: *
Disallow: /private
Allow: /private/public
Crawl-delay: 2

User-agent: SmartManuBot
Disallow: /research/*/draft$
Disallow: /same
Allow: /same
Crawl-delay: 4.2

User-agent: SmartManuBot
Allow: /research/open
Crawl-delay: 7 # conservative across repeated groups
`);

  assert.equal(rules.groups.length, 3);
  assert.equal(rules.crawlDelaySeconds, 7);
  assert.equal(
    isUrlAllowed(rules, "https://school.example/private/page", "OtherBot"),
    false,
  );
  assert.equal(
    isUrlAllowed(rules, "https://school.example/private/public", "OtherBot"),
    true,
  );
  // A specific product group replaces the wildcard group.
  assert.equal(
    isUrlAllowed(
      rules,
      "https://school.example/private/page",
      "Mozilla/5.0 SmartManuBot/1.0",
    ),
    true,
  );
  assert.equal(
    isUrlAllowed(
      rules,
      "https://school.example/research/2027/draft",
      "SmartManuBot",
    ),
    false,
  );
  assert.equal(
    isUrlAllowed(
      rules,
      "https://school.example/research/2027/draft?preview=1",
      "SmartManuBot",
    ),
    true,
    "terminal anchors include the query in the match target",
  );
  assert.equal(
    isUrlAllowed(rules, "https://school.example/same", "SmartManuBot"),
    true,
    "Allow wins equal-specificity ties",
  );
  assert.equal(getCrawlDelaySeconds(rules, "SmartManuBot/1.0"), 7);
  assert.equal(getCrawlDelaySeconds(rules, "OtherBot"), 2);
});

test("robots parsing bounds delays and handles comments, BOM, casing and malformed records", () => {
  const rules = parseRobotsTxt(`\uFEFF# source policy
USER-AGENT: Example.Bot
User-Agent: SecondBot
Disallow:
Allow: /public # inline comment
Crawl-Delay: 0.1
Crawl-delay: ${MAX_ROBOTS_CRAWL_DELAY_SECONDS + 1000}
Crawl-delay: forever
Unknown: /ignored

broken line
Disallow: /outside-a-group
`);
  assert.deepEqual(rules.groups[0].userAgents, ["example.bot", "secondbot"]);
  assert.deepEqual(rules.groups[0].allow, ["/public"]);
  assert.deepEqual(rules.groups[0].disallow, []);
  assert.equal(
    rules.groups[0].crawlDelaySeconds,
    MAX_ROBOTS_CRAWL_DELAY_SECONDS,
  );
  assert.equal(rules.groups[0].crawlDelayCapped, true);
  assert.equal(rules.crawlDelaySeconds, MAX_ROBOTS_CRAWL_DELAY_SECONDS);
  assert.equal(
    isUrlAllowed(rules, "https://example.com/anything", "NoMatch"),
    true,
  );
  assert.equal(
    isUrlAllowed(rules, "https://example.com/public", "Example.Bot"),
    true,
  );

  for (const malformed of ["", null, {}, "Disallow: /private", "User-agent:"])
    assert.equal(
      isUrlAllowed(
        parseRobotsTxt(malformed),
        "https://example.com/private",
        "SmartManuBot",
      ),
      true,
    );
  assert.equal(
    isUrlAllowed(parseRobotsTxt("User-agent: *"), "not a URL", "bot"),
    false,
  );
});

test("robots matching normalizes percent octets and keeps fragments out of policy paths", () => {
  const rules = parseRobotsTxt(`User-agent: *
Disallow: /caf%C3%A9
Disallow: /招生/内部
Disallow: /docs/~private
Allow: /docs/%7Eprivate/public
`);
  assert.equal(
    isUrlAllowed(rules, "https://example.com/caf%C3%A9#public", "bot"),
    false,
  );
  assert.equal(
    isUrlAllowed(rules, "https://example.com/%E6%8B%9B%E7%94%9F/内部", "bot"),
    false,
  );
  assert.equal(
    isUrlAllowed(rules, "https://example.com/docs/%7eprivate/file", "bot"),
    false,
  );
  assert.equal(
    isUrlAllowed(rules, "https://example.com/docs/~private/public", "bot"),
    true,
  );
});

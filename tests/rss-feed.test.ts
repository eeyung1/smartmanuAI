import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RSS_FEED_BYTES,
  MAX_RSS_FEED_ITEMS,
  parseRssOrAtomFeed,
} from "../src/research/rss-feed";

test("RSS 2.0 feeds expose bounded normalized items and sanitized summaries", () => {
  const feed = parseRssOrAtomFeed(
    `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="urn:content">
  <channel>
    <title>Scholarship &amp; admissions</title>
    <item>
      <title>智能制造 scholarship</title>
      <link>/awards/2027</link>
      <guid isPermaLink="false">award-2027</guid>
      <pubDate>Tue, 10 Nov 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[<script>steal()</script><p>Full tuition &amp; living support.</p>]]></description>
    </item>
    <item>
      <title>Missing optional fields</title>
      <content:encoded><![CDATA[<b>Review the official source.</b>]]></content:encoded>
    </item>
  </channel>
</rss>`,
    "https://school.example.edu/feed.xml",
  );
  assert.equal(feed?.format, "rss");
  assert.equal(feed?.title, "Scholarship & admissions");
  assert.deepEqual(feed?.items[0], {
    id: "award-2027",
    title: "智能制造 scholarship",
    link: "https://school.example.edu/awards/2027",
    publishedAt: "2026-11-10T12:00:00.000Z",
    summary: "Full tuition & living support.",
  });
  assert.deepEqual(feed?.items[1], {
    id: null,
    title: "Missing optional fields",
    link: null,
    publishedAt: null,
    summary: "Review the official source.",
  });
  assert.doesNotMatch(JSON.stringify(feed), /steal|script/i);
});

test("Atom feeds handle namespaces, HTML text, canonical links and ISO dates", () => {
  const feed = parseRssOrAtomFeed(
    `<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
      <atom:title type="text">Official opportunities</atom:title>
      <atom:entry>
        <atom:id>tag:school.example.edu,2026:course</atom:id>
        <atom:title type="html">Automation &amp; Robotics</atom:title>
        <atom:link rel="self" href="https://school.example.edu/feed/entry" />
        <atom:link rel="alternate" href="courses/automation" />
        <atom:updated>2026-11-10T08:30:00+08:00</atom:updated>
        <atom:summary type="html">&lt;p&gt;Free course &amp;amp; certificate.&lt;/p&gt;</atom:summary>
      </atom:entry>
    </atom:feed>`,
    "https://school.example.edu/admissions/feed.xml",
  );
  assert.deepEqual(feed, {
    format: "atom",
    title: "Official opportunities",
    items: [
      {
        id: "tag:school.example.edu,2026:course",
        title: "Automation & Robotics",
        link: "https://school.example.edu/admissions/courses/automation",
        publishedAt: "2026-11-10T00:30:00.000Z",
        summary: "Free course & certificate.",
      },
    ],
    truncated: false,
  });
});

test("feed limits and malformed XML fail closed without resolving unsafe links", () => {
  const manyItems = Array.from(
    { length: MAX_RSS_FEED_ITEMS + 3 },
    (_, index) =>
      `<item><guid>${index}</guid><title>Item ${index}</title><link>https://school.example.edu/${index}</link></item>`,
  ).join("");
  const bounded = parseRssOrAtomFeed(
    `<rss><channel><title>Many</title>${manyItems}</channel></rss>`,
  );
  assert.equal(bounded?.items.length, MAX_RSS_FEED_ITEMS);
  assert.equal(bounded?.truncated, true);
  assert.equal(bounded?.items.at(-1)?.id, String(MAX_RSS_FEED_ITEMS - 1));

  for (const invalid of [
    "",
    null,
    "<rss><channel></rss>",
    "<feed><entry></feed>",
    "<!DOCTYPE rss [<!ENTITY secret SYSTEM 'file:///etc/passwd'>]><rss />",
    "<rss><channel><title>&unknown;</title></channel></rss>",
    "<html><body>not a feed</body></html>",
  ])
    assert.equal(parseRssOrAtomFeed(invalid), null);

  assert.equal(parseRssOrAtomFeed("x".repeat(MAX_RSS_FEED_BYTES + 1)), null);
  const unsafe = parseRssOrAtomFeed(
    `<rss><channel><item><link>//127.0.0.1/private</link></item></channel></rss>`,
    "https://school.example.edu/feed",
  );
  assert.equal(unsafe?.items[0].link, null);
});

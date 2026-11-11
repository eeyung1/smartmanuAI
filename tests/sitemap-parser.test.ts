import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  matchesExcludedPath,
  parseSitemapXml,
} from "../src/research/sitemap-parser";

const origin = "https://school.example.edu";

test("urlset entries are normalized with metadata and relative link resolution", () => {
  const result = parseSitemapXml(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://school.example.edu/admissions/scholarship</loc>
    <lastmod>2026-11-01</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>/international/apply</loc>
    <changefreq>weekly</changefreq>
  </url>
  <url>
    <loc>https://school.example.edu/admissions/scholarship</loc>
  </url>
</urlset>`,
    origin,
  );
  assert.equal(result.ok, true);
  assert.equal(result.kind, "urlset");
  assert.equal(result.entries.length, 2, "duplicate locations are skipped");
  assert.equal(result.skipped, 1);
  const [first, second] = result.entries;
  assert.equal(first.loc, "https://school.example.edu/admissions/scholarship");
  assert.equal(first.lastmod, "2026-11-01");
  assert.equal(first.changefreq, "daily");
  assert.equal(first.priority, 0.8);
  assert.equal(first.weight, 0.64);
  assert.equal(second.loc, "https://school.example.edu/international/apply");
  assert.equal(second.lastmod, null);
  assert.equal(second.changefreq, "weekly");
  assert.equal(second.priority, null);
});

test("sitemap indexes are parsed as nested sitemap entries", () => {
  const result = parseSitemapXml(
    `<sitemapindex>
  <sitemap><loc>https://school.example.edu/sitemaps/university.xml</loc><lastmod>2026-10-30</lastmod></sitemap>
  <sitemap><loc>https://school.example.edu/sitemaps/admissions.xml</loc><changefreq>monthly</changefreq></sitemap>
</sitemapindex>`,
    origin,
  );
  assert.equal(result.kind, "sitemapindex");
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].kind, "sitemap");
  assert.equal(result.entries[0].lastmod, "2026-10-30");
  assert.equal(result.entries[1].changefreq, "monthly");
});

test("cross-domain, excluded and malformed links are filtered out", () => {
  const result = parseSitemapXml(
    `<urlset>
  <url><loc>https://school.example.edu/keep</loc></url>
  <url><loc>https://other.example.net/keep</loc></url>
  <url><loc>https://school.example.edu/private/secret</loc></url>
  <url><loc>not a url</loc></url>
  <url><loc>http://school.example.edu/insecure</loc></url>
  <url><loc>https://school.example.edu:8443/port</loc></url>
</urlset>`,
    origin,
    { excludedPaths: ["/private"] },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.entries.map((entry) => entry.loc),
    ["https://school.example.edu/keep"],
  );
  assert.equal(result.skipped, 5);
});

test("gzip buffers, entities and CDATA are handled", () => {
  const xml = `<urlset><url><loc><![CDATA[https://school.example.edu/cdata]]></loc></url></urlset>`;
  const gzipped = gzipSync(Buffer.from(xml, "utf8"));
  const result = parseSitemapXml(gzipped, origin);
  assert.equal(result.ok, true);
  assert.equal(result.entries[0].loc, "https://school.example.edu/cdata");
  const encoded = parseSitemapXml(
    "<urlset><url><loc>https://school.example.edu/a?x=1&amp;y=2</loc></url></urlset>",
    origin,
  );
  assert.equal(encoded.entries[0].loc, "https://school.example.edu/a?x=1&y=2");
  const invalidGzip = parseSitemapXml(
    Buffer.from([0x1f, 0x8b, 0x00, 0x01, 0x02]),
    origin,
  );
  assert.equal(invalidGzip.ok, false);
  assert.equal(invalidGzip.reason, "invalid_gzip");
});

test("malformed documents and unsafe input fail safely", () => {
  for (const [content, reason] of [
    ["", "invalid_content"],
    ["<html><body>not a sitemap</body></html>", "not_a_sitemap"],
    [
      "<!DOCTYPE foo [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><urlset/>",
      "unsupported_declaration",
    ],
    [null, "invalid_content"],
    [42, "invalid_content"],
  ] as const) {
    const result = parseSitemapXml(content as never, origin);
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.deepEqual(result.entries, []);
  }
  assert.equal(
    parseSitemapXml("<urlset/>", "not a url").reason,
    "invalid_base_origin",
  );
});

test("entry limits and robots-style path patterns are respected", () => {
  const many = `<urlset>${Array.from(
    { length: 20 },
    (_, index) =>
      `<url><loc>https://school.example.edu/page-${index}</loc></url>`,
  ).join("")}</urlset>`;
  const capped = parseSitemapXml(many, origin, { maxEntries: 5 });
  assert.equal(capped.entries.length, 5);
  assert.equal(
    parseSitemapXml(many, origin, { maxEntries: 0 }).reason,
    "invalid_limit",
  );
  assert.equal(matchesExcludedPath("/private/secret", "/private"), true);
  assert.equal(matchesExcludedPath("/public/secret", "/private"), false);
  assert.equal(matchesExcludedPath("/a/b.pdf", "/*.pdf$"), true);
  assert.equal(matchesExcludedPath("/a/b.pdf", "/a/*.pdf"), true);
});

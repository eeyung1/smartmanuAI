import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CANDIDATE_HTML_BYTES,
  extractCandidateLinks,
} from "../src/research/candidate-extractor";

test("candidate extraction resolves, filters and canonically deduplicates opportunity links", () => {
  const html = `
    <nav><a href="#top">Top</a></nav>
    <a href="../scholarships/robotics/?utm_source=feed&amp;b=2&amp;a=1#details">Robotics scholarship</a>
    <a HREF='https://www.school.edu/scholarships/robotics?a=1&amp;b=2'>Duplicate canonical URL</a>
    <a href="https://admissions.school.edu/international/apply">International admissions</a>
    <a href="https://funding.school.edu/机会">留学生奖学金</a>
    <a href="https://evil.example/scholarship">External scholarship</a>
    <a href="https://facebook.com/school/admissions">Social media</a>
    <a href="mailto:admissions@school.edu">Admissions email</a>
    <a href="/files/scholarship.pdf">Scholarship PDF</a>
    <a href="/news/general">Ordinary news</a>
    <script><a href="/scholarship/fake">fake</a></script>
  `;
  assert.deepEqual(
    extractCandidateLinks(html, "https://www.school.edu/directories/list.html"),
    [
      "https://www.school.edu/scholarships/robotics?a=1&b=2",
      "https://admissions.school.edu/international/apply",
      "https://funding.school.edu/%E6%9C%BA%E4%BC%9A",
    ],
  );
});

test("candidate options enforce explicit host, subdomain and result policies", () => {
  const html = `
    <a href="https://apply.school.edu/program">Apply now</a>
    <a href="https://partner.ac.uk/fellowships/one">Fellowship one</a>
    <a href="https://other.school.edu/admissions">Admissions</a>
    <a href="/招生/一">招生一</a>
    <a href="/招生/二">招生二</a>
  `;
  assert.deepEqual(
    extractCandidateLinks(html, "https://school.edu/list", {
      allowSubdomains: false,
      permittedHosts: ["partner.ac.uk"],
      maxCandidates: 2,
    }),
    [
      "https://partner.ac.uk/fellowships/one",
      "https://school.edu/%E6%8B%9B%E7%94%9F/%E4%B8%80",
    ],
  );
  assert.deepEqual(
    extractCandidateLinks(
      '<a href="/opportunities/one">custom phrase</a>',
      "https://school.edu/list",
      { keywords: ["custom phrase"] },
    ),
    ["https://school.edu/opportunities/one"],
  );
});

test("malformed and oversized inputs fail safely without widening URL admission", () => {
  for (const [html, base] of [
    [null, "https://school.edu"],
    ["<a href='/scholarship'>broken", "not a URL"],
    ["<a href='/scholarship'>broken", "http://school.edu"],
    ["<a href='/scholarship'>broken", "https://127.0.0.1"],
  ] as const)
    assert.deepEqual(extractCandidateLinks(html, base), []);
  assert.deepEqual(
    extractCandidateLinks(
      "x".repeat(MAX_CANDIDATE_HTML_BYTES + 1),
      "https://school.edu",
    ),
    [],
  );
  assert.deepEqual(
    extractCandidateLinks(
      `<a href="/scholarship.zip">Scholarship</a>
       <a href="javascript:alert(1)">Admissions</a>
       <a href="https://school.edu:8443/admissions">Admissions</a>
       <a href="https://user:secret@school.edu/admissions">Admissions</a>`,
      "https://school.edu",
    ),
    [],
  );
  assert.throws(() =>
    extractCandidateLinks("", "https://school.edu", { maxCandidates: 0 }),
  );
});

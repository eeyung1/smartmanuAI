import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MULTI_EXTRACTOR_HTML_BYTES,
  extractMultipleOpportunities,
} from "../src/research/multi-extractor";

test("table rows extract independent records without cross-contamination", () => {
  const html = `
    <table>
      <tr><th>Programme</th><th>Deadline</th><th>Funding</th></tr>
      <tr>
        <td><a href="/robotics-master">Robotics Master's</a></td>
        <td>Deadline: 2027-03-01</td>
        <td>Fully funded</td>
      </tr>
      <tr>
        <td><a href="https://admissions.school.edu/ai-masters">AI Master's</a></td>
        <td>Apply by 2027-04-15</td>
        <td>Partial scholarship</td>
      </tr>
    </table>`;
  const records = extractMultipleOpportunities(
    html,
    "https://school.edu/programmes",
  );
  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((record) => record.title),
    ["Robotics Master's", "AI Master's"],
  );
  assert.deepEqual(
    records.map((record) => record.url),
    [
      "https://school.edu/robotics-master",
      "https://admissions.school.edu/ai-masters",
    ],
  );
  assert.deepEqual(
    records.map((record) => record.deadlineText),
    ["2027-03-01", "2027-04-15"],
  );
  assert.deepEqual(
    records.map((record) => record.funding),
    ["fully_funded", "partial"],
  );
  assert.ok(records.every((record) => record.source === "row"));
  assert.ok(records.every((record) => record.confidence > 0.7));
});

test("list items and cards parse fields with safe fallbacks", () => {
  const html = `
    <ul>
      <li><a href="/bursary/2027">Bursary 2027</a> - 额满为止 - 全额奖学金</li>
      <li><a href="/course/free">Free course</a></li>
    </ul>
    <div class="listing-card">
      <a href="/fellowship">Fellowship</a>
      <span>Deadline: 2026-12-01</span>
      <span>Huazhong University of Science and Technology</span>
    </div>`;
  const records = extractMultipleOpportunities(html, "https://school.edu/list");
  assert.equal(records.length, 3);
  const bursary = records[0];
  assert.equal(bursary?.title, "Bursary 2027");
  assert.equal(bursary?.url, "https://school.edu/bursary/2027");
  assert.equal(bursary?.deadlineText, null);
  assert.equal(bursary?.host, "school.edu");
  assert.ok((bursary?.confidence ?? 0) < 0.9);
  const card = records[2];
  assert.equal(card?.source, "card");
  assert.equal(card?.host, "Huazhong University of Science and Technology");
  assert.equal(card?.deadlineText, "2026-12-01");
});

test("unsafe hosts, duplicates, limits and malformed input are handled safely", () => {
  const html = `
    <table>
      <tr><td><a href="https://evil.example/scholarship">External</a></td></tr>
      <tr><td><a href="https://school.edu/a">A</a></td></tr>
      <tr><td><a href="https://school.edu/a?utm_source=x">A duplicate</a></td></tr>
      <tr><td><a href="/files/apply.pdf">PDF</a></td></tr>
    </table>`;
  const records = extractMultipleOpportunities(html, "https://school.edu/list");
  assert.equal(records.length, 1);
  assert.equal(records[0].url, "https://school.edu/a");
  assert.deepEqual(
    extractMultipleOpportunities(null, "https://school.edu"),
    [],
  );
  assert.deepEqual(extractMultipleOpportunities(html, "not a url"), []);
  assert.deepEqual(extractMultipleOpportunities(html, "http://school.edu"), []);
  assert.deepEqual(
    extractMultipleOpportunities(
      "x".repeat(MAX_MULTI_EXTRACTOR_HTML_BYTES + 1),
      "https://school.edu",
    ),
    [],
  );
  const capped = extractMultipleOpportunities(
    `<ul>${Array.from(
      { length: 6 },
      (_, index) => `<li><a href="/item-${index}">Item ${index}</a></li>`,
    ).join("")}</ul>`,
    "https://school.edu/list",
    { maxResults: 2 },
  );
  assert.equal(capped.length, 2);
  assert.throws(() =>
    extractMultipleOpportunities(html, "https://school.edu", {
      maxResults: 0,
    }),
  );
});

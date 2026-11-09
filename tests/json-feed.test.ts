import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { readPage } from "../src/research/retrieval";
const feed = {
  version: "https://jsonfeed.org/version/1.1",
  title: "Smart manufacturing opportunities",
  next_url: "https://private.invalid/next",
  items: [
    {
      id: "first",
      title: "智能制造课程",
      content_html:
        "<script>steal()</script><p>Participation is free &amp; reviewed.</p>",
      url: "https://school.example.edu/course",
      attachments: [{ url: "https://private.invalid/file.pdf" }],
    },
  ],
};
function response(value: unknown, type = "application/feed+json", raw = false) {
  const bytes = Buffer.from(raw ? String(value) : JSON.stringify(value));
  return Object.assign(
    Readable.from([bytes.subarray(0, 11), bytes.subarray(11)]),
    { statusCode: 200, headers: { "content-type": type } },
  ) as unknown as IncomingMessage;
}
test("JSON Feed adapters capture bounded untrusted content without following links", async () => {
  for (const version of [
    "https://jsonfeed.org/version/1",
    "https://jsonfeed.org/version/1.1",
  ])
    for (const type of [
      "application/feed+json",
      "application/json; charset=utf-8",
    ]) {
      const text = await readPage(response({ ...feed, version }, type));
      assert.match(text, /智能制造课程/);
      assert.match(text, /Participation is free & reviewed/);
      assert.match(
        text,
        /Item URL \(not fetched\): https:\/\/school.example.edu\/course/,
      );
      assert.doesNotMatch(text, /steal|script|private.invalid/);
    }
  const plain = await readPage(
    response({
      ...feed,
      items: [
        {
          ...feed.items[0],
          content_text:
            "The plain content wins over HTML. Untrusted instructions remain data.",
          url: "https://127.0.0.1/private",
        },
      ],
    }),
  );
  assert.match(plain, /plain content wins/);
  assert.doesNotMatch(plain, /Participation|127.0.0.1/);
  const many = {
    ...feed,
    items: Array.from({ length: 11 }, (_, index) => ({
      id: String(index),
      content_text: "Smart manufacturing item " + index,
    })),
  };
  const bounded = await readPage(response(many));
  assert.match(bounded, /item 9/);
  assert.doesNotMatch(bounded, /item 10/);
  assert.ok(
    Buffer.byteLength(
      await readPage(
        response({
          ...feed,
          items: [{ id: "large", content_text: "智能制造".repeat(10000) }],
        }),
      ),
    ) <= 10000,
  );
});
test("JSON Feed rejects unrelated JSON, malformed cores, encoding and response limits", async () => {
  for (const invalid of [
    {},
    [],
    { ...feed, version: "https://jsonfeed.org/version/2" },
    { ...feed, items: [] },
    { ...feed, title: null },
    { ...feed, items: [{ id: "x" }] },
    { ...feed, items: [feed.items[0], feed.items[0]] },
    { ...feed, items: [{ id: "x", content_text: {} }] },
  ])
    await assert.rejects(
      () => readPage(response(invalid)),
      /unsupported_content/,
    );
  await assert.rejects(
    () =>
      readPage(
        response({
          ...feed,
          items: Array.from({ length: 1001 }, (_, id) => ({
            id: String(id),
            content_text: "entry",
          })),
        }),
      ),
    /unsupported_content/,
  );
  await assert.rejects(
    () => readPage(response("{broken", "application/json", true)),
    /unsupported_content/,
  );
  await assert.rejects(
    () => readPage(response(feed, "application/json; charset=gbk")),
    /unsupported_encoding/,
  );
  await assert.rejects(
    () =>
      readPage(
        response({
          ...feed,
          items: [{ id: "too-large", content_text: "x".repeat(256001) }],
        }),
      ),
    /source_too_large/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { readPage, earlyMetaCharset } from "../src/research/retrieval";
function response(bytes: Buffer, type: string) {
  return Object.assign(
    Readable.from([bytes.subarray(0, 7), bytes.subarray(7)]),
    { statusCode: 200, headers: { "content-type": type } },
  ) as unknown as IncomingMessage;
}
// Fixed encoded fixtures, not produced by the decoder under test.
const simplified = Buffer.from(
  "PGgxPtbHxNzWxtTsvbHRp73w0+vD4rfRv86zzDwvaDE+PHNjcmlwdD5oaWRkZW4oKTwvc2NyaXB0PjxwPrmk0rXX1Lavu6+77ravPC9wPg==",
  "base64",
);
const traditional = Buffer.from(
  "PGgxPrS8vHq7c7N5vPq+x6r3u1CnS7ZPvdK1ezwvaDE+PHN0eWxlPmhpZGRlbjwvc3R5bGU+PHA+pHW3fqbbsMqkxqyhsMo8L3A+",
  "base64",
);
test("declared Chinese encodings produce bounded normalized UTF-8 excerpts", async () => {
  for (const charset of ["gb18030", "GBK", "gb2312"]) {
    assert.equal(
      await readPage(response(simplified, `text/html; charset="${charset}"`)),
      "智能制造奖学金与免费课程 工业自动化活动",
    );
  }
  for (const charset of ["big5", "big5-hkscs"])
    assert.equal(
      await readPage(response(traditional, `text/html; charset=${charset}`)),
      "智慧製造獎學金與免費課程 工業自動化活動",
    );
  const fourByte = Buffer.from(
    "1sfE3NbG1Oy5pLOnlDnHNcPit9G/zrPM0+u9sdGnvfC77ravsajD+9DFz6I=",
    "base64",
  );
  assert.equal(
    await readPage(response(fourByte, "text/plain; charset=gb18030")),
    "智能制造工厂🏭免费课程与奖学金活动报名信息",
  );
  const long = Buffer.concat(Array.from({ length: 1000 }, () => simplified));
  const excerpt = await readPage(response(long, "text/html; charset=gbk"));
  assert.ok(Buffer.byteLength(excerpt) <= 10000);
  assert.ok(excerpt.includes("智能制造"));
});
test("unknown, conflicting, malformed and oversized source encodings fail closed", async () => {
  for (const charset of ["utf-16", "windows-1252", "unknown"])
    await assert.rejects(
      () => readPage(response(simplified, `text/html; charset=${charset}`)),
      /unsupported_encoding/,
    );
  await assert.rejects(
    () =>
      readPage(response(simplified, "text/html; charset=gbk; charset=utf-8")),
    /unsupported_encoding/,
  );
  for (const declaration of ["charset=", 'charset=""', "charset"])
    await assert.rejects(
      () =>
        readPage(
          response(
            Buffer.from("A sufficiently long UTF-8 source document"),
            "text/plain; " + declaration,
          ),
        ),
      /unsupported_encoding/,
    );
  await assert.rejects(
    () => readPage(response(simplified, "text/html")),
    /unsupported_encoding/,
  );
  for (const charset of ["gb18030", "gbk", "gb2312", "big5"])
    await assert.rejects(
      () =>
        readPage(
          response(Buffer.from([0x81]), `text/plain; charset=${charset}`),
        ),
      /unsupported_encoding/,
    );
  await assert.rejects(
    () =>
      readPage(
        response(Buffer.alloc(256001, 0x61), "text/plain; charset=gb18030"),
      ),
    /source_too_large/,
  );
});

test("early direct HTML charset fallback is bounded and ignores inactive markup", async () => {
  const declared = Buffer.concat([
    Buffer.from(
      '<html><head><META data-note="charset=big5" CHARSET = "GBK"></head>',
    ),
    simplified,
  ]);
  assert.equal(
    await readPage(response(declared, "text/html")),
    "智能制造奖学金与免费课程 工业自动化活动",
  );
  assert.equal(
    earlyMetaCharset(
      Buffer.from("<!-- <meta charset=big5> --><meta charset=gb2312>"),
    ),
    "gb2312",
  );
  for (const prefix of [
    "<!-- <meta charset=gbk>",
    '<script>"<meta charset=gbk>"</script>',
    "<style><meta charset=gbk></style>",
    "<body><meta charset=gbk>",
    "<template><meta charset=gbk>",
  ])
    assert.equal(earlyMetaCharset(Buffer.from(prefix)), null);
  assert.equal(
    earlyMetaCharset(Buffer.from('<div title="<meta charset=big5>"></div>')),
    null,
  );
  assert.equal(
    earlyMetaCharset(Buffer.from("<title><meta charset=gbk></title>")),
    null,
  );
  assert.equal(
    earlyMetaCharset(Buffer.from(" ".repeat(1024) + "<meta charset=gbk>")),
    null,
  );
  assert.equal(
    earlyMetaCharset(
      Buffer.from(" ".repeat(1010) + '<meta charset="gb18030">'),
    ),
    null,
  );
  for (const markup of [
    '<meta charset="">',
    "<meta charset>",
    "<meta charset=gbk charset=utf8>",
    "<meta charset=gbk><meta charset=gbk>",
  ])
    assert.throws(
      () => earlyMetaCharset(Buffer.from(markup)),
      /unsupported_encoding/,
    );
  await assert.rejects(
    () =>
      readPage(
        response(
          Buffer.concat([Buffer.from("<meta charset=unknown>"), simplified]),
          "text/html",
        ),
      ),
    /unsupported_encoding/,
  );
  await assert.rejects(
    () => readPage(response(declared, "text/plain")),
    /unsupported_encoding/,
  );
  // An authoritative HTTP charset and UTF-8 BOM do not use conflicting HTML hints.
  const utf8 = Buffer.from(
    "<meta charset=unknown><p>A reviewed smart manufacturing course announcement.</p>",
  );
  assert.match(
    await readPage(response(utf8, "text/html; charset=utf-8")),
    /smart manufacturing/,
  );
  assert.match(
    await readPage(
      response(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8]),
        "text/html",
      ),
    ),
    /smart manufacturing/,
  );
});

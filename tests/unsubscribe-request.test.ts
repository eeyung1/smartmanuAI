import test from "node:test";
import assert from "node:assert/strict";
import { parseUnsubscribeRequest } from "../src/channels/unsubscribe-request";
const request = (body: BodyInit, type?: string, query = "token=capability") =>
  new Request("https://example.test/unsubscribe?" + query, {
    method: "POST",
    body,
    ...(type ? { headers: { "Content-Type": type } } : {}),
  });
test("unsubscribe accepts URL-encoded and multipart without cookies or authorization", async () => {
  assert.deepEqual(
    await parseUnsubscribeRequest(
      request(
        "List-Unsubscribe=One-Click",
        "Application/X-Www-Form-Urlencoded; charset=UTF-8",
      ),
    ),
    { token: "capability", oneClick: true },
  );
  const form = new FormData();
  form.set("List-Unsubscribe", "One-Click");
  assert.deepEqual(await parseUnsubscribeRequest(request(form)), {
    token: "capability",
    oneClick: true,
  });
  assert.deepEqual(
    await parseUnsubscribeRequest(
      request(
        "confirm=unsubscribe&token=capability",
        "application/x-www-form-urlencoded",
        "",
      ),
    ),
    { token: "capability", oneClick: false },
  );
});
test("unsubscribe rejects malformed, ambiguous, file and oversized forms", async () => {
  for (const body of [
    "List-Unsubscribe=One-Click&List-Unsubscribe=wrong",
    "List-Unsubscribe=One-Click&token=other",
    "confirm=no",
  ])
    await assert.rejects(() =>
      parseUnsubscribeRequest(
        request(body, "application/x-www-form-urlencoded"),
      ),
    );
  await assert.rejects(() =>
    parseUnsubscribeRequest(
      request(
        "List-Unsubscribe=One-Click",
        "application/x-www-form-urlencoded",
        "token=a&token=b",
      ),
    ),
  );
  await assert.rejects(() =>
    parseUnsubscribeRequest(request("broken", "multipart/form-data")),
  );
  await assert.rejects(() =>
    parseUnsubscribeRequest(request("{}", "application/json")),
  );
  const file = new FormData();
  file.set("List-Unsubscribe", "One-Click");
  file.set("file", new Blob(["x"]), "upload.txt");
  await assert.rejects(() => parseUnsubscribeRequest(request(file)));
  await assert.rejects(
    () =>
      parseUnsubscribeRequest(
        request("x".repeat(64001), "application/x-www-form-urlencoded"),
      ),
    { status: 413 },
  );
  const big =
    '--boundary\r\nContent-Disposition: form-data; name="padding"\r\n\r\n' +
    "x".repeat(64001) +
    "\r\n--boundary--\r\n";
  await assert.rejects(
    () =>
      parseUnsubscribeRequest(
        request(big, "multipart/form-data; boundary=boundary"),
      ),
    { status: 413 },
  );
});

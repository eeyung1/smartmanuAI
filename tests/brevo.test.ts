import test from "node:test";
import assert from "node:assert/strict";
import {
  brevoConfig,
  buildBrevoRequest,
  brevoTransport,
} from "../src/delivery/brevo";

const config = brevoConfig({
  BREVO_API_KEY: "fixture-only",
  EMAIL_FROM: "smartmanuAI <sender@example.test>",
});
test("Brevo formats the verified sender, recipient and provider headers", async () => {
  const request = buildBrevoRequest(config, {
    to: "member@example.test",
    subject: "Sign in",
    text: "A private sign-in link",
    headers: {
      "List-Unsubscribe": "<https://example.test/unsubscribe>",
      Authorization: "must-not-forward",
    },
  });
  const response = await brevoTransport(async (url, options) => {
    assert.equal(url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(options?.method, "POST");
    assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).get("api-key"), "fixture-only");
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body.sender, config.sender);
    assert.deepEqual(body.to, [{ email: "member@example.test" }]);
    assert.match(body.htmlContent, /A private sign-in link/);
    assert.equal(body.textContent, undefined);
    assert.equal(body.headers["Authorization"], undefined);
    assert.ok(body.headers["List-Unsubscribe"]);
    return Response.json(
      { messageId: "<receipt@example.test>" },
      { status: 201 },
    );
  })(request, new AbortController().signal);
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { messageId: "<receipt@example.test>" });
});
test("Brevo validates settings without exposing secrets and blocks header injection", () => {
  assert.throws(
    () => brevoConfig({ BREVO_API_KEY: "private-secret", EMAIL_FROM: "bad" }),
    /EMAIL_FROM/,
  );
  assert.throws(
    () => brevoConfig({ EMAIL_FROM: "sender@example.test" }),
    /BREVO_API_KEY/,
  );
  assert.throws(
    () => buildBrevoRequest(config, { to: "bad", subject: "Hi", text: "Hi" }),
    /recipient/,
  );
  assert.throws(
    () =>
      buildBrevoRequest(config, {
        to: "member@example.test",
        subject: "Hi\r\nBcc: bad",
        text: "Hi",
      }),
    /subject/,
  );
});
test("Brevo transport rejects arbitrary endpoints without a network call", async () => {
  await assert.rejects(
    brevoTransport(async () => {
      throw Error("must not call");
    })(
      { url: "https://attacker.test", headers: {}, body: "" },
      new AbortController().signal,
    ),
    /endpoint/,
  );
});

test("Brevo sign-in payload omits empty headers and renders escaped clickable links", () => {
  const body = JSON.parse(
    buildBrevoRequest(config, {
      to: "member@example.test",
      subject: "Sign in",
      text: 'Hello <script>alert("x")</script>\n\nhttps://example.test/api/auth/magic-link/verify?token=fixture&callbackURL=%2Fmatches',
    }).body,
  );
  assert.equal(Object.hasOwn(body, "headers"), false);
  assert.equal(Object.hasOwn(body, "textContent"), false);
  assert.match(body.htmlContent, /&lt;script&gt;/);
  assert.ok(!body.htmlContent.includes("<script>"));
  assert.match(
    body.htmlContent,
    /<a href="https:\/\/example.test\/api\/auth\/magic-link\/verify\?token=fixture&amp;callbackURL=%2Fmatches">/,
  );
});

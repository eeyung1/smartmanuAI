import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LiveEmail from "../app/notifications/live-email";
test("live email screen makes consent, operator setup and free-plan schedule explicit in both languages", () => {
  const initial = {
    enabled: false,
    version: 0,
    frequency: "daily",
    timezone: "UTC",
    nextDueAt: null,
    profileReady: false,
    providerConnected: false,
    suppressionReason: null,
    history: [],
  };
  const en = renderToStaticMarkup(
    createElement(LiveEmail, { initial, operator: true, locale: "en" }),
  );
  assert.match(en, /Connect Brevo callbacks/);
  assert.match(en, /09:00 UTC/);
  assert.match(en, /I consent to real/);
  assert.match(en, /not mean delivered/);
  assert.ok(!en.includes("Connect Telegram"));
  const member = renderToStaticMarkup(
    createElement(LiveEmail, { initial, operator: false, locale: "en" }),
  );
  assert.ok(!member.includes(">Connect Brevo callbacks<"));
  const zh = renderToStaticMarkup(
    createElement(LiveEmail, { initial, operator: true, locale: "zh-Hans" }),
  );
  assert.match(zh, /连接 Brevo 回调/);
  assert.match(zh, /退订链接/);
});

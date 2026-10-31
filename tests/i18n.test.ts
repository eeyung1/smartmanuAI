import test from "node:test";
import assert from "node:assert/strict";
import { resolveAlertLanguage } from "../src/i18n/locale";
import { renderAlertText } from "../src/i18n/alerts";
import {
  buildSimulationRequest,
  simulationPayloadSchema,
} from "../src/delivery/adapters";
const item = {
  id: "fixture/one",
  title: '<script>"Original 中文 title"</script>',
  funding: "tuition_only",
  deadline: "2027-03-31",
  applicationFee: "CNY 400 — non-refundable",
  certificateFee: null,
  synthetic: true as const,
};
const unsubscribe = {
  landingPath: "/unsubscribe?token=test.fake",
  postPath: "/api/notifications/unsubscribe?token=test.fake",
  postBody: "List-Unsubscribe=One-Click" as const,
};
test("localized alerts preserve source facts, distinguish unknown fees and escape both channels", () => {
  for (const language of ["en", "zh-Hans"] as const) {
    const payload = simulationPayloadSchema.parse({
      mode: "local_sink",
      ...resolveAlertLanguage(language),
      items: [item],
      unsubscribe,
    });
    const email = JSON.parse(
      buildSimulationRequest("email", "a@example.test", payload, "same-id")
        .body,
    );
    const telegram = JSON.parse(
      buildSimulationRequest("telegram", "12345", payload, "same-id").body,
    );
    for (const text of [email.text, telegram.text]) {
      assert.ok(text.includes(item.title));
      assert.ok(text.includes(item.applicationFee));
      assert.ok(text.includes("2027-03-31"));
      assert.ok(text.includes("fixture%2Fone"));
      assert.ok(
        text.includes(
          language === "en" ? "Tuition covered only" : "仅覆盖学费",
        ),
      );
      assert.ok(text.includes(language === "en" ? "Not stated" : "未说明"));
      assert.ok(
        !text.includes(
          language === "en" ? "living costs funded" : "生活费获资助",
        ),
      );
    }
    assert.ok(email.html.includes("&lt;script&gt;"));
    assert.ok(!email.html.includes("<script>"));
    assert.ok(email.subject.includes(language === "en" ? "synthetic" : "模拟"));
    assert.ok(
      email.html.includes(
        language === "en" ? "Pause email digests" : "暂停邮件摘要",
      ),
    );
    assert.equal(telegram.parse_mode, undefined);
    assert.equal(
      email.headers["List-Unsubscribe-Post"],
      "List-Unsubscribe=One-Click",
    );
  }
});
test("unsupported and legacy alert language snapshots use explicit English fallback", () => {
  const resolved = resolveAlertLanguage("fr");
  assert.equal(resolved.language, "en");
  assert.equal(resolved.translationFallback, true);
  const text = renderAlertText({
    ...resolved,
    items: [item],
    synthetic: false,
  });
  assert.ok(text.includes("English fallback"));
  assert.ok(text.includes("LOCAL DIGEST PREVIEW"));
  const old = simulationPayloadSchema.parse({
    mode: "local_sink",
    translationFallback: true,
    items: [item],
    unsubscribe,
  });
  assert.equal(old.language, "en");
  const legacy = JSON.parse(
    buildSimulationRequest("email", "a@example.test", old, "stable").body,
  );
  assert.ok(legacy.text.includes("English fallback"));
  assert.ok(legacy.text.includes(item.applicationFee));
});
test("ten localized digest items fit a Telegram preview without splitting Unicode characters", () => {
  for (const language of ["en", "zh-Hans"] as const) {
    const payload = simulationPayloadSchema.parse({
      mode: "local_sink",
      language,
      translationFallback: false,
      items: Array.from({ length: 10 }, (_, index) => ({
        ...item,
        id: `fixture-${index}`,
        title: "制造🤖".repeat(50),
        funding: "fully_funded",
        applicationFee: "A".repeat(200),
        certificateFee: "B".repeat(200),
      })),
      unsubscribe,
    });
    const request = JSON.parse(
      buildSimulationRequest("telegram", "12345", payload, "stable").body,
    );
    assert.ok(request.text.length <= 4096);
    assert.ok(request.text.isWellFormed());
    assert.ok(request.text.includes("…"));
  }
});

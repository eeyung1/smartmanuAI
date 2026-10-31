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

test("screen translation keeps typed values, interpolated counts and source topics separate", async () => {
  const { screenText, screenLabel, matchExplanation, screenMessage } =
    await import("../src/i18n/screens");
  assert.equal(
    screenText("zh-Hans", "Results: {count}", { count: 12 }),
    "结果：12",
  );
  assert.equal(screenLabel("zh-Hans", "tuition_only"), "仅覆盖学费");
  assert.equal(screenLabel("zh-Hans", "applied"), "已申请（自行填报）");
  assert.equal(
    matchExplanation("zh-Hans", "Topic overlap: smart manufacturing, Save."),
    "相关主题： smart manufacturing, Save.",
  );
  assert.equal(
    screenMessage("zh-Hans", "Your tracker changed. Reload and retry."),
    "跟踪列表已更改，请重新加载后重试。",
  );
  assert.equal(
    screenMessage("zh-Hans", "Unmapped service failure"),
    "服务消息（原文）：Unmapped service failure",
  );
  assert.equal(screenText("en", "Your matches"), "Your matches");
  assert.equal(screenLabel("en", "applied"), "Applied");
});

test("localized controls preserve consent, deletion and uncertain-send scope", async () => {
  const { screenLabel, screenMessage, screenText } =
    await import("../src/i18n/screens");
  const { localeFromCookie } = await import("../src/i18n/locale");
  assert.equal(
    localeFromCookie("session=private; smartmanu_locale=zh-Hans"),
    "zh-Hans",
  );
  assert.equal(localeFromCookie("smartmanu_locale=<script>"), null);
  assert.equal(localeFromCookie("other_smartmanu_locale=zh-Hans"), null);
  assert.equal(localeFromCookie(null), null);
  assert.equal(screenLabel("zh-Hans", "uncertain"), "结果不确定——需要人工核查");
  assert.equal(screenLabel("zh-Hans", "active"), "已在本地确认");
  assert.equal(screenLabel("zh-Hans", "rejected"), "目录审核未通过的记录");
  assert.ok(screenText("zh-Hans", "Type DELETE to confirm").includes("DELETE"));
  assert.ok(
    screenMessage(
      "zh-Hans",
      "Sign in again before exporting or deleting account data.",
    ).includes("重新登录"),
  );
  const done = screenMessage(
    "zh-Hans",
    "Application database account and local authentication mail purged. Operational suppression markers and backup expiry are separate.",
  );
  assert.ok(done.includes("不在此次清理范围内"));
  assert.equal(
    screenText("zh-Hans", "Diagnostic code: {code}", { code: "worker_lost" }),
    "诊断代码：worker_lost",
  );
});

test("admin labels keep collection and candidate states distinct from Telegram confirmation", async () => {
  const { researchState, screenLabel, screenText, screenMessage } =
    await import("../src/i18n/screens");
  assert.equal(
    researchState("zh-Hans", "candidate", "pending"),
    "候选记录等待验证",
  );
  assert.equal(screenLabel("zh-Hans", "pending"), "待确认");
  assert.equal(researchState("zh-Hans", "job", "done"), "采集已完成");
  assert.equal(
    researchState("en", "candidate", "drafted"),
    "Candidate drafted",
  );
  assert.ok(
    screenText(
      "zh-Hans",
      "Enter only requirements supported by the eligibility source excerpt. Blank means unknown. ALL means the source explicitly permits all nationalities.",
    ).includes("ALL"),
  );
  assert.ok(
    screenText(
      "zh-Hans",
      "Application fee and currency or leave blank if unknown",
    ).includes("未知时请留空"),
  );
  assert.equal(
    screenMessage(
      "zh-Hans",
      "Verify the official source and field evidence before publishing.",
    ),
    "发布前请核实官方来源及字段证据。",
  );
  assert.equal(screenLabel("zh-Hans", "title"), "标题");
});

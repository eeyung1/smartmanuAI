import { createElement } from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorPage from "../app/error";
import GlobalError from "../app/global-error";
import NotFoundScreen from "../app/components/not-found-screen";
import FailureScreen from "../app/components/failure-screen";
import { LocaleProvider } from "../src/i18n/context";
test("error recovery hides exceptions and preserves a safe localized route to receipt status", () => {
  const secret = Object.assign(new Error("private token: SECRET_VALUE_123"), {
    digest: "private-digest-456",
  });
  let resets = 0;
  for (const locale of ["en", "zh-Hans"] as const) {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: locale,
        children: createElement(ErrorPage, {
          error: secret,
          reset: () => {
            resets++;
          },
        }),
      }),
    );
    assert.ok(!html.includes("SECRET_VALUE_123"));
    assert.ok(!html.includes(secret.digest));
    assert.ok(html.includes('href="/privacy/status"'));
    assert.ok(html.includes('href="/opportunities"'));
    assert.ok(
      html.includes(
        locale === "en"
          ? "check its status before submitting again"
          : "先查询处理状态",
      ),
    );
    assert.ok(
      html.includes(locale === "en" ? "Try loading again" : "尝试重新加载"),
    );
  }
  assert.equal(resets, 0, "rendering a failure never retries automatically");
});
test("not-found and root-layout fallback do not disclose a missing record or depend on account state", () => {
  const missing = renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale: "zh-Hans",
      children: createElement(NotFoundScreen, { locale: "zh-Hans" }),
    }),
  );
  assert.ok(missing.includes("未找到页面"));
  assert.ok(missing.includes('href="/sign-in"'));
  const root = renderToStaticMarkup(
    createElement(GlobalError, {
      error: new Error("database password: DO_NOT_DISPLAY"),
      reset: () => {},
    }),
  );
  assert.ok(root.includes('<html lang="en">'));
  assert.ok(root.includes('value="zh-Hans"'));
  assert.ok(root.includes('name="viewport"'));
  assert.ok(!root.includes("DO_NOT_DISPLAY"));
  const chineseRootContent = renderToStaticMarkup(
    createElement(FailureScreen, { locale: "zh-Hans", reset: () => {} }),
  );
  assert.ok(chineseRootContent.includes("页面加载出现问题"));
});

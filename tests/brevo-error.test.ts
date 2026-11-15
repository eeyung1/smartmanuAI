import test from "node:test";
import assert from "node:assert/strict";
import { BrevoDeliveryError } from "../src/delivery/brevo-error";

test("Brevo failure categories distinguish actionable causes without exposing provider data", () => {
  const cases = [
    [
      401,
      {
        code: "unauthorized",
        message:
          "We have detected you are using an unrecognised IP address 203.0.113.1",
      },
      "ip_authorization_required",
    ],
    [401, { message: "Key not found" }, "api_authentication_rejected"],
    [403, { message: "Permission denied" }, "api_authentication_rejected"],
    [
      400,
      { message: "Sender is not verified" },
      "sender_configuration_rejected",
    ],
    [402, { code: "not_enough_credits" }, "quota_exhausted"],
    [429, {}, "rate_limited"],
    [503, {}, "provider_unavailable"],
    [201, {}, "invalid_success_response"],
    [
      400,
      { message: "secret-token https://example.com/magic?token=private" },
      "request_rejected",
    ],
  ] as const;
  for (const [status, body, reason] of cases) {
    const error = new BrevoDeliveryError(status, body);
    assert.equal(error.reason, reason);
    assert.match(error.message, new RegExp(`HTTP ${status}`));
    assert.doesNotMatch(
      error.stack!,
      /203\.0\.113|secret-token|token=private|Key not found/,
    );
    assert.doesNotMatch(
      JSON.stringify(error),
      /203\.0\.113|secret-token|token=private/,
    );
  }
  const malformed = new BrevoDeliveryError(NaN, "untrusted raw body");
  assert.equal(malformed.status, 0);
  assert.equal(malformed.reason, "request_rejected");
});

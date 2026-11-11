import test from "node:test";
import assert from "node:assert/strict";
import {
  dispatchDeliveryIntent,
  type DispatchOptions,
} from "../src/delivery/transport-dispatcher";
import type { DeliveryIntent } from "../src/delivery/intent-queue";
import type { ProviderRequest, Transport } from "../src/delivery/adapters";

const now = new Date("2026-11-10T00:00:00.000Z");

function intent(overrides: Partial<DeliveryIntent> = {}): DeliveryIntent {
  return {
    id: "intent-1",
    userId: "user-1",
    channel: "email",
    template: "deadline_reminder",
    recipient: "member@example.test",
    payloadRef: "payload:v1:abc",
    dedupeKey: "key-1",
    status: "DISPATCHING",
    attempts: 1,
    maxAttempts: 5,
    createdAt: 0,
    updatedAt: 0,
    availableAt: 0,
    leaseToken: "lease-1",
    leaseUntil: 60_000,
    receipt: null,
    lastError: null,
    suppressionReason: null,
    ...overrides,
  };
}

function transportReturning(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Transport {
  return async () => ({ status, headers, body });
}

const payload = {
  title: "Smart manufacturing scholarship",
  body: "Application deadline in 7 days.",
  subject: "Deadline reminder",
  unsubscribeUrl: "https://smartmanu.example/unsubscribe?token=abc",
  unsubscribePostUrl: "https://smartmanu.example/unsubscribe",
};

test("email intents are dispatched with RFC 8058 headers", async () => {
  let captured: ProviderRequest | null = null;
  const transport: Transport = async (request) => {
    captured = request;
    return { status: 202, headers: {}, body: { message_id: "provider-1" } };
  };
  const receipt = await dispatchDeliveryIntent(intent(), transport, {
    payload,
    now: () => now,
  });
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.externalReference, "provider-1");
  assert.equal(receipt.timestamp, now.toISOString());
  assert.equal(receipt.code, null);
  const request = captured as unknown as ProviderRequest;
  assert.equal(
    request.headers["List-Unsubscribe"],
    "<https://smartmanu.example/unsubscribe?token=abc>",
  );
  assert.equal(
    request.headers["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );
  assert.equal(request.headers["Content-Type"], "text/plain; charset=utf-8");
  assert.match(request.body, /Smart manufacturing scholarship/);
});

test("telegram intents are dispatched as bounded formatted messages", async () => {
  let captured: ProviderRequest | null = null;
  const transport: Transport = async (request) => {
    captured = request;
    return {
      status: 200,
      headers: {},
      body: { ok: true, result: { message_id: 77 } },
    };
  };
  const receipt = await dispatchDeliveryIntent(
    intent({ channel: "telegram", recipient: "123456789" }),
    transport,
    {
      payload,
      telegramBotToken: "bot-token",
      now: () => now,
    },
  );
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.externalReference, "77");
  const request = captured as unknown as ProviderRequest;
  assert.match(request.url, /sendMessage$/);
  const body = JSON.parse(request.body) as Record<string, unknown>;
  assert.equal(body.chat_id, "123456789");
  assert.equal(body.allow_paid_broadcast, false);
  assert.equal(body.disable_web_page_preview, true);
  assert.ok(String(body.text).length <= 4_096);
});

test("provider responses normalize into receipts", async () => {
  const cases: {
    status: number;
    expected: string;
    code: string;
    headers?: Record<string, string>;
  }[] = [
    { status: 200, expected: "accepted", code: "" },
    {
      status: 429,
      expected: "retry",
      code: "rate_limited",
      headers: { "retry-after": "120" },
    },
    { status: 503, expected: "retry", code: "provider_error" },
    { status: 400, expected: "failed", code: "provider_rejected" },
    { status: 302, expected: "failed", code: "unexpected_status" },
  ];
  for (const testCase of cases) {
    const receipt = await dispatchDeliveryIntent(
      intent(),
      transportReturning(testCase.status, {}, testCase.headers),
      { payload, now: () => now },
    );
    assert.equal(receipt.status, testCase.expected, String(testCase.status));
    if (testCase.code)
      assert.equal(receipt.code, testCase.code, String(testCase.status));
  }
  const limited = await dispatchDeliveryIntent(
    intent(),
    transportReturning(429, {}, { "retry-after": "120" }),
    { payload, now: () => now },
  );
  assert.equal(limited.retryAfterSeconds, 120);
});

test("timeouts and network errors are retried without uncaught rejections", async () => {
  const timedOut = await dispatchDeliveryIntent(
    intent(),
    (_request, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    { payload, timeoutMs: 10, now: () => now },
  );
  assert.equal(timedOut.status, "retry");
  assert.equal(timedOut.code, "timeout");

  const failed = await dispatchDeliveryIntent(
    intent(),
    async () => {
      throw new Error("socket hang up");
    },
    { payload, now: () => now },
  );
  assert.equal(failed.status, "retry");
  assert.equal(failed.code, "network_error");
  assert.ok(failed.retryAfterSeconds !== null);
});

test("paused channels, missing payloads and unleased intents never reach the transport", async () => {
  let called = 0;
  const transport: Transport = async () => {
    called++;
    return { status: 200, headers: {}, body: {} };
  };
  const paused = await dispatchDeliveryIntent(intent(), transport, {
    payload,
    isChannelPaused: () => true,
    now: () => now,
  });
  assert.equal(paused.status, "suppressed");
  assert.equal(paused.code, "channel_paused");

  const missing = await dispatchDeliveryIntent(intent(), transport, {
    now: () => now,
  });
  assert.equal(missing.status, "failed");
  assert.equal(missing.code, "payload_unavailable");

  const notLeased = await dispatchDeliveryIntent(
    intent({ status: "PENDING" }),
    transport,
    { payload, now: () => now },
  );
  assert.equal(notLeased.status, "failed");
  assert.equal(notLeased.code, "not_leased");

  const noToken = await dispatchDeliveryIntent(
    intent({ channel: "telegram", recipient: "123456789" }),
    transport,
    { payload, now: () => now },
  );
  assert.equal(noToken.status, "failed");
  assert.equal(noToken.code, "missing_bot_token");
  assert.equal(called, 0);
});

test("payloads resolve through the stored reference", async () => {
  const receipt = await dispatchDeliveryIntent(
    intent(),
    transportReturning(200, { message_id: "resolved-1" }),
    {
      resolvePayload: (reference) => {
        assert.equal(reference, "payload:v1:abc");
        return payload;
      },
      now: () => now,
    } as DispatchOptions,
  );
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.externalReference, "resolved-1");
});

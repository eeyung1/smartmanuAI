import test from "node:test";
import assert from "node:assert/strict";
import { createDeliveryCircuitBreaker } from "../src/delivery/circuit-breaker";
import type { DeliveryIntent } from "../src/delivery/intent-queue";

function breakerAt(start = 1_000_000) {
  let now = start;
  const breaker = createDeliveryCircuitBreaker({
    now: () => now,
    failureThreshold: 5,
    cooldownMs: 900_000,
  });
  return { breaker, advance: (ms: number) => (now += ms), now: () => now };
}

function intent(overrides: Partial<DeliveryIntent> = {}): DeliveryIntent {
  return {
    id: "intent-1",
    userId: "user-1",
    channel: "email",
    template: "deadline_reminder",
    recipient: "member@example.test",
    payloadRef: "payload:v1:abc",
    dedupeKey: "key-1",
    status: "DEAD_LETTER",
    attempts: 5,
    maxAttempts: 5,
    createdAt: 0,
    updatedAt: 0,
    availableAt: 0,
    leaseToken: null,
    leaseUntil: null,
    receipt: null,
    lastError: "provider 503",
    suppressionReason: null,
    ...overrides,
  };
}

test("consecutive failures trip the channel open and cool it down", () => {
  const { breaker, advance } = breakerAt();
  assert.equal(breaker.evaluateCircuitState("email").state, "CLOSED");
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = breaker.recordDeliveryOutcome("email", {
      status: "retry",
      code: "provider_error",
    });
    assert.equal(state.state, "CLOSED");
    assert.equal(state.consecutiveFailures, attempt + 1);
    assert.equal(state.allowRequest, true);
  }
  const tripped = breaker.recordDeliveryOutcome("email", {
    status: "retry",
    code: "provider_error",
  });
  assert.equal(tripped.state, "OPEN");
  assert.equal(tripped.allowRequest, false);
  assert.equal(tripped.reason, "cooldown_active");
  assert.equal(
    tripped.openedUntil,
    new Date(1_000_000 + 900_000).toISOString(),
  );
  advance(900_000);
  const halfOpen = breaker.evaluateCircuitState("email");
  assert.equal(halfOpen.state, "HALF_OPEN");
  assert.equal(halfOpen.allowRequest, true);
  assert.equal(halfOpen.reason, "probe_allowed");
});

test("half-open probes either close the channel or trip it again", () => {
  const { breaker, advance } = breakerAt();
  for (let attempt = 0; attempt < 5; attempt++)
    breaker.recordDeliveryOutcome("email", { status: "retry" });
  advance(900_000);
  assert.equal(breaker.evaluateCircuitState("email").state, "HALF_OPEN");
  assert.equal(breaker.beginProbe("email").ok, true);
  assert.equal(
    breaker.evaluateCircuitState("email").reason,
    "probe_in_flight",
    "only one probe is allowed",
  );
  const failed = breaker.recordDeliveryOutcome("email", {
    status: "retry",
    code: "provider_error",
  });
  assert.equal(failed.state, "OPEN");
  assert.equal(failed.allowRequest, false);

  advance(900_000);
  breaker.beginProbe("email");
  const recovered = breaker.recordDeliveryOutcome("email", {
    status: "accepted",
  });
  assert.equal(recovered.state, "CLOSED");
  assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.allowRequest, true);
});

test("success, suppression and fatal recipient errors are not provider failures", () => {
  const { breaker } = breakerAt();
  breaker.recordDeliveryOutcome("email", { status: "retry" });
  breaker.recordDeliveryOutcome("email", { status: "retry" });
  const suppressed = breaker.recordDeliveryOutcome("email", {
    status: "suppressed",
  });
  assert.equal(suppressed.consecutiveFailures, 2);
  const fatal = breaker.recordDeliveryOutcome("email", {
    status: "failed",
    retryable: false,
  });
  assert.equal(fatal.consecutiveFailures, 2);
  assert.equal(fatal.state, "CLOSED");
  const accepted = breaker.recordDeliveryOutcome("email", {
    status: "accepted",
  });
  assert.equal(accepted.consecutiveFailures, 0);
  const invalid = breaker.recordDeliveryOutcome("email", {
    status: "unknown" as never,
  });
  assert.equal(invalid.reason, "invalid_outcome");
  assert.equal(
    breaker.evaluateCircuitState("sms" as never).reason,
    "invalid_channel",
  );
});

test("exhausted and fatal intents route to the dead-letter queue", () => {
  const { breaker } = breakerAt();
  const exhausted = breaker.routeToDeadLetterQueue(
    intent(),
    "retries exhausted",
  );
  assert.equal(exhausted.ok, true);
  assert.equal(exhausted.entry?.intentId, "intent-1");
  assert.equal(exhausted.entry?.attempts, 5);
  assert.equal(exhausted.entry?.code, "provider 503");
  assert.equal(exhausted.entry?.reason, "retries exhausted");

  const notExhausted = breaker.routeToDeadLetterQueue(
    intent({ id: "intent-2", attempts: 1, maxAttempts: 5 }),
    "still retrying",
  );
  assert.equal(notExhausted.ok, false);
  assert.equal(notExhausted.reason, "not_exhausted");

  const fatal = breaker.routeToDeadLetterQueue(
    intent({ id: "intent-3", attempts: 1, maxAttempts: 5 }),
    "invalid recipient",
    { fatal: true },
  );
  assert.equal(fatal.ok, true);
  assert.equal(fatal.entry?.reason, "invalid recipient");

  const duplicate = breaker.routeToDeadLetterQueue(
    intent(),
    "retries exhausted",
  );
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, "already_routed");
  assert.equal(breaker.deadLetters().length, 2);
  assert.equal(
    breaker.routeToDeadLetterQueue(null, "invalid").reason,
    "invalid_intent",
  );
});

test("dead letters replay only when the channel is healthy", () => {
  const { breaker, advance } = breakerAt();
  breaker.routeToDeadLetterQueue(intent({ id: "intent-email" }), "exhausted");
  breaker.routeToDeadLetterQueue(
    intent({ id: "intent-telegram", channel: "telegram" }),
    "exhausted",
  );
  for (let attempt = 0; attempt < 5; attempt++)
    breaker.recordDeliveryOutcome("email", { status: "retry" });

  const blocked = breaker.replayDeadLetterQueue({});
  assert.equal(blocked.ok, true);
  assert.equal(blocked.replayed.length, 1);
  assert.equal(blocked.replayed[0].channel, "telegram");
  assert.equal(blocked.skipped, 1);
  assert.equal(breaker.deadLetters().length, 1);

  advance(900_000);
  const healthy = breaker.replayDeadLetterQueue({ channel: "email" });
  assert.equal(healthy.replayed.length, 1);
  assert.equal(healthy.replayed[0].intentId, "intent-email");
  assert.equal(breaker.deadLetters().length, 0);
  assert.equal(
    breaker.replayDeadLetterQueue({ limit: 0 }).reason,
    "invalid_limit",
  );
});

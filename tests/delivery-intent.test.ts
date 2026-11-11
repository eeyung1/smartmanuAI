import test from "node:test";
import assert from "node:assert/strict";
import { createDeliveryIntentQueue } from "../src/delivery/intent-queue";

function queueAt(start = 1_000_000) {
  let now = start;
  let counter = 0;
  const queue = createDeliveryIntentQueue({
    now: () => now,
    leaseTtlMs: 60_000,
    channelFailureThreshold: 3,
    channelPauseMs: 900_000,
    backoffScheduleMs: [60_000, 300_000, 900_000],
    idFactory: () => `id-${++counter}`,
  });
  return {
    queue,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    now: () => now,
  };
}

const intent = (overrides: Record<string, unknown> = {}) => ({
  userId: "user-1",
  channel: "email" as const,
  template: "deadline_reminder",
  recipient: "member@example.test",
  payloadRef: "payload:v1:abc123",
  ...overrides,
});

test("intents validate input and deduplicate by key", () => {
  const { queue } = queueAt();
  const created = queue.enqueueDeliveryIntent(intent());
  assert.equal(created.created, true);
  assert.equal(created.intent.status, "PENDING");
  assert.equal(created.intent.attempts, 0);
  assert.equal(created.intent.maxAttempts, 5);
  assert.match(created.intent.dedupeKey, /^[a-f0-9]{64}$/);

  const duplicate = queue.enqueueDeliveryIntent(intent());
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.intent.id, created.intent.id);
  assert.equal(queue.size(), 1);

  const keyed = queue.enqueueDeliveryIntent(
    intent({ dedupeKey: "explicit-key" }),
  );
  assert.equal(keyed.created, true);
  assert.equal(keyed.intent.dedupeKey, "explicit-key");

  for (const invalid of [
    intent({ channel: "sms" }),
    intent({ recipient: "not-an-email" }),
    intent({ channel: "telegram", recipient: "abc" }),
    intent({ payloadRef: '{"raw":"payload"}' }),
    intent({ userId: "" }),
    intent({ template: "" }),
  ])
    assert.throws(() => queue.enqueueDeliveryIntent(invalid));
});

test("leases are bounded, exclusive and recoverable after expiry", () => {
  const { queue, advance } = queueAt();
  queue.enqueueDeliveryIntent(intent());
  queue.enqueueDeliveryIntent(
    intent({ template: "digest", payloadRef: "payload:v1:def" }),
  );
  const leased = queue.leaseNextDeliveryIntents({ limit: 1 });
  assert.equal(leased.length, 1);
  assert.equal(leased[0].status, "DISPATCHING");
  assert.equal(leased[0].attempts, 1);
  assert.ok(leased[0].leaseToken);
  assert.equal(leased[0].leaseUntil, 1_000_000 + 60_000);

  const second = queue.leaseNextDeliveryIntents({ limit: 10 });
  assert.equal(second.length, 1);
  assert.notEqual(second[0].id, leased[0].id);
  assert.equal(
    queue.leaseNextDeliveryIntents({ limit: 10 }).length,
    0,
    "leased intents are not dispatched twice",
  );

  advance(60_001);
  const recovered = queue.leaseNextDeliveryIntents({ limit: 10 });
  assert.equal(recovered.length, 2, "both expired leases are reclaimable");
  assert.ok(
    recovered.some((entry) => entry.id === leased[0].id),
    "expired leases are reclaimable",
  );
  assert.equal(
    recovered.find((entry) => entry.id === leased[0].id)?.attempts,
    2,
  );
});

test("failures back off, exhaust into dead letter and suppress on demand", () => {
  const { queue, advance } = queueAt();
  const created = queue.enqueueDeliveryIntent(intent({ maxAttempts: 4 }));
  const leased = queue.leaseNextDeliveryIntents({ limit: 1 })[0];
  const failed = queue.markFailed(leased.id, new Error("provider 503"), {
    leaseToken: leased.leaseToken!,
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.reason, "retry_scheduled");
  assert.equal(failed.intent?.status, "FAILED");
  assert.equal(failed.intent?.availableAt, 1_000_000 + 60_000);
  assert.equal(
    queue.leaseNextDeliveryIntents().length,
    0,
    "backoff is honoured",
  );

  advance(60_001);
  const second = queue.leaseNextDeliveryIntents({ limit: 1 })[0];
  queue.markFailed(second.id, "still failing");
  advance(300_001);
  const third = queue.leaseNextDeliveryIntents({ limit: 1 })[0];
  queue.markFailed(third.id, "still failing");
  advance(900_001);
  const fourth = queue.leaseNextDeliveryIntents({ limit: 1 })[0];
  const dead = queue.markFailed(fourth.id, "still failing");
  assert.equal(dead.intent?.status, "DEAD_LETTER");
  assert.equal(dead.reason, "dead_letter");
  assert.equal(queue.leaseNextDeliveryIntents().length, 0);

  const other = queue.enqueueDeliveryIntent(
    intent({ template: "digest", payloadRef: "payload:v1:xyz" }),
  );
  const suppressed = queue.markSuppressed(
    other.intent.id,
    "recipient opted out",
  );
  assert.equal(suppressed.ok, true);
  assert.equal(suppressed.intent?.status, "SUPPRESSED");
  assert.equal(suppressed.intent?.suppressionReason, "recipient opted out");
  assert.equal(
    queue.markDelivered(other.intent.id, "receipt").ok,
    false,
    "a suppressed intent cannot be delivered",
  );
  assert.equal(created.created, true);
});

test("delivered intents record a receipt and reject stale leases", () => {
  const { queue } = queueAt();
  queue.enqueueDeliveryIntent(intent());
  const leased = queue.leaseNextDeliveryIntents()[0];
  const stale = queue.markDelivered(leased.id, "receipt-1", {
    leaseToken: "wrong-token",
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "stale_lease");
  const delivered = queue.markDelivered(leased.id, { reference: "receipt-1" });
  assert.equal(delivered.ok, true);
  assert.equal(delivered.intent?.status, "DELIVERED");
  assert.equal(delivered.intent?.receipt, "receipt-1");
  assert.equal(delivered.intent?.leaseToken, null);
  assert.equal(
    queue.markDelivered(leased.id, "receipt-2").reason,
    "not_dispatching",
  );
  assert.equal(
    queue.markDelivered("missing", "receipt").reason,
    "unknown_intent",
  );
});

test("repeated channel failures pause the channel without blocking others", () => {
  const { queue, advance } = queueAt();
  for (let index = 0; index < 3; index++) {
    queue.enqueueDeliveryIntent(
      intent({
        template: `digest-${index}`,
        payloadRef: `payload:v1:${index}`,
      }),
    );
    const leased = queue.leaseNextDeliveryIntents({ limit: 1 })[0];
    queue.markFailed(leased.id, "channel error");
    advance(60_001);
  }
  assert.equal(queue.isChannelPaused("email"), true);
  queue.enqueueDeliveryIntent(
    intent({ template: "digest-late", payloadRef: "payload:v1:late" }),
  );
  assert.equal(
    queue.leaseNextDeliveryIntents({ limit: 10 }).length,
    0,
    "a paused channel is not dispatched",
  );
  queue.enqueueDeliveryIntent(
    intent({
      channel: "telegram",
      recipient: "123456789",
      template: "digest-telegram",
      payloadRef: "payload:v1:telegram",
    }),
  );
  const telegram = queue.leaseNextDeliveryIntents({ limit: 10 });
  assert.equal(telegram.length, 1, "other channels keep working");
  assert.equal(telegram[0].channel, "telegram");

  advance(900_001);
  assert.equal(queue.isChannelPaused("email"), false, "the pause expires");
});

test("a successful delivery clears the channel failure counter", () => {
  const { queue } = queueAt();
  queue.enqueueDeliveryIntent(intent());
  const leased = queue.leaseNextDeliveryIntents()[0];
  queue.markFailed(leased.id, "temporary error");
  assert.equal(queue.isChannelPaused("email"), false);
  queue.enqueueDeliveryIntent(
    intent({ template: "digest-2", payloadRef: "payload:v1:two" }),
  );
  const next = queue.leaseNextDeliveryIntents()[0];
  const delivered = queue.markDelivered(next.id, "receipt");
  assert.equal(delivered.ok, true);
  assert.equal(queue.isChannelPaused("email"), false);
});

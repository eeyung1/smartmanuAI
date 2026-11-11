import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BACKOFF_SCHEDULE_MS,
  backoffDelayMs,
  createHostCooldownCoordinator,
  evaluateHostAvailability,
  normalizeHostname,
} from "../src/research/host-cooldown";

test("host availability reflects failures, backoff and retry-after", () => {
  let now = 1_000_000;
  const coordinator = createHostCooldownCoordinator({ now: () => now });
  const fresh = coordinator.evaluate("school.example.edu");
  assert.equal(fresh.status, "AVAILABLE");
  assert.equal(fresh.eligible, true);

  coordinator.recordFailure("school.example.edu");
  const cooling = coordinator.evaluate("school.example.edu");
  assert.equal(cooling.status, "COOLING_DOWN");
  assert.equal(cooling.eligible, false);
  assert.equal(cooling.waitMs, DEFAULT_BACKOFF_SCHEDULE_MS[0]);
  assert.equal(cooling.cooldownUntil, now + DEFAULT_BACKOFF_SCHEDULE_MS[0]);

  now += DEFAULT_BACKOFF_SCHEDULE_MS[0];
  coordinator.recordFailure("school.example.edu");
  assert.equal(
    coordinator.evaluate("school.example.edu").waitMs,
    DEFAULT_BACKOFF_SCHEDULE_MS[1],
  );

  now += DEFAULT_BACKOFF_SCHEDULE_MS[1];
  const limited = coordinator.recordFailure("school.example.edu", {
    retryAfterMs: 900_000,
  });
  assert.equal(limited.status, "RATE_LIMITED");
  assert.equal(limited.waitMs, 900_000);

  now += 900_000;
  const recovered = coordinator.recordSuccess("school.example.edu");
  assert.equal(recovered.status, "AVAILABLE");
  assert.equal(recovered.consecutiveFailures, 0);
});

test("repeated failures escalate to the ceiling and then stop the host", () => {
  let now = 0;
  const coordinator = createHostCooldownCoordinator({ now: () => now });
  const delays: number[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const availability = coordinator.recordFailure("school.example.edu");
    delays.push(
      availability.cooldownUntil ? availability.cooldownUntil - now : 0,
    );
    now += 1_000;
  }
  assert.deepEqual(delays.slice(0, 3), [10_000, 30_000, 120_000]);
  assert.ok(delays[3] > 120_000);
  assert.ok(delays[4] <= 1_800_000);
  const stopped = coordinator.evaluate("school.example.edu");
  assert.equal(stopped.status, "MAX_RETRIES_EXCEEDED");
  assert.equal(stopped.eligible, false);
  assert.equal(backoffDelayMs(0), 0);
  assert.equal(backoffDelayMs(50), 1_800_000);
});

test("leases are bounded, expire and release idempotently", () => {
  let now = 0;
  const coordinator = createHostCooldownCoordinator({
    now: () => now,
    leaseTtlMs: 60_000,
  });
  const granted = coordinator.acquireHostLease("school.example.edu");
  assert.equal(granted.granted, true);
  assert.ok(granted.lease);
  const second = coordinator.acquireHostLease("school.example.edu");
  assert.equal(second.granted, false);
  assert.equal(second.reason, "lease_held");

  assert.equal(
    coordinator.releaseHostLease("school.example.edu", granted.lease!.id),
    true,
  );
  assert.equal(
    coordinator.releaseHostLease("school.example.edu", granted.lease!.id),
    false,
    "releasing an unknown lease is a no-op",
  );
  const again = coordinator.acquireHostLease("school.example.edu");
  assert.equal(again.granted, true);

  now += 60_001;
  const expired = coordinator.evaluate("school.example.edu");
  assert.equal(expired.activeLeases, 0, "abandoned leases expire");
  assert.equal(expired.eligible, true);
  const afterExpiry = coordinator.acquireHostLease("school.example.edu");
  assert.equal(afterExpiry.granted, true);
});

test("malformed and unknown hosts are handled without throwing", () => {
  const coordinator = createHostCooldownCoordinator();
  for (const invalid of [
    "",
    "   ",
    "not a host",
    "http://school.example",
    null,
  ])
    assert.equal(coordinator.evaluate(invalid).status, "UNKNOWN");
  assert.equal(coordinator.acquireHostLease("not a host").granted, false);
  assert.equal(coordinator.releaseHostLease("not a host", "lease-1"), false);
  assert.equal(coordinator.recordFailure("not a host").status, "UNKNOWN");
  assert.equal(coordinator.recordSuccess("not a host").status, "UNKNOWN");
  const unknown = coordinator.evaluate("unknown.example.edu");
  assert.equal(unknown.status, "AVAILABLE");
  assert.equal(unknown.eligible, true);
  assert.equal(
    normalizeHostname(" SCHOOL.Example.EDU. "),
    "school.example.edu",
  );
  assert.equal(normalizeHostname("bad host"), null);
});

test("pure availability evaluation never mutates the given state", () => {
  const state = {
    hostname: "school.example.edu",
    lastRequestAt: null,
    lastFailureAt: null,
    consecutiveFailures: 2,
    retryAfterUntil: null,
    leases: [],
  };
  const snapshot = JSON.stringify(state);
  const availability = evaluateHostAvailability(state, { now: () => 0 });
  assert.equal(availability.status, "COOLING_DOWN");
  assert.equal(availability.eligible, false);
  assert.equal(JSON.stringify(state), snapshot);
  const unknown = evaluateHostAvailability(null, { now: () => 0 });
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(unknown.eligible, false);
});

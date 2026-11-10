import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_HOST_PACER_DELAY_SECONDS,
  createHostPacer,
  normalizeHostKey,
} from "../src/research/host-pacer";

test("host pacer normalizes host keys and enforces floor and robots delays", async () => {
  let now = 10_000;
  const waits: number[] = [];
  const pacer = createHostPacer({
    minimumIntervalMs: 500,
    now: () => now,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      now += milliseconds;
    },
  });
  assert.equal(
    normalizeHostKey("HTTPS://School.Example.EDU:443/first"),
    "school.example.edu",
  );
  assert.equal(
    normalizeHostKey("http://school.example.edu.:80/second"),
    "school.example.edu",
  );
  assert.equal(
    normalizeHostKey("https://school.example.edu:8443/path"),
    "school.example.edu:8443",
  );
  assert.throws(() => normalizeHostKey("relative/path"));
  assert.throws(() => normalizeHostKey("ftp://school.example.edu/file"));

  const starts: number[] = [];
  await pacer.schedule("https://school.example.edu/a", () => starts.push(now));
  assert.equal(pacer.evaluate("https://SCHOOL.EXAMPLE.EDU/b").waitMs, 500);
  await pacer.schedule(
    "https://school.example.edu/b",
    { crawlDelaySeconds: 2.25 },
    () => starts.push(now),
  );
  assert.deepEqual(starts, [10_000, 12_250]);
  assert.deepEqual(waits, [2_250]);
  assert.deepEqual(pacer.evaluate("https://school.example.edu/c"), {
    host: "school.example.edu",
    eligible: false,
    active: false,
    queued: 0,
    lastStartedAt: 12_250,
    nextEligibleAt: 14_500,
    waitMs: 2_250,
    intervalMs: 2_250,
  });
  assert.throws(() => pacer.evaluate("https://school.example.edu", -1));
  assert.equal(
    pacer.evaluate("https://other.example.edu", {
      crawlDelaySeconds: MAX_HOST_PACER_DELAY_SECONDS + 100,
    }).intervalMs,
    MAX_HOST_PACER_DELAY_SECONDS * 1_000,
  );
});

test("host pacer serializes one host while independent hosts progress", async () => {
  let now = 0;
  const pacer = createHostPacer({
    minimumDelayMs: 0,
    clock: () => now,
    wait: async (milliseconds) => {
      now += milliseconds;
    },
  });
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const events: string[] = [];
  const first = pacer.run("https://school.example.edu/a", async () => {
    events.push("first-start");
    await firstBlocked;
    events.push("first-end");
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pacer.check("https://school.example.edu/b").active, true);

  const second = pacer.run("https://school.example.edu/b", async () => {
    events.push("second-start");
  });
  const other = pacer.run("https://other.example.edu/a", async () => {
    events.push("other-start");
  });
  await other;
  assert.deepEqual(events, ["first-start", "other-start"]);
  assert.equal(pacer.evaluate("https://school.example.edu/b").queued, 1);

  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    "first-start",
    "other-start",
    "first-end",
    "second-start",
  ]);
  assert.equal(pacer.evaluate("https://school.example.edu").active, false);
});

test("manual leases are idempotently released after deterministic pacing", async () => {
  let now = 100;
  const pacer = createHostPacer({
    minimumIntervalMs: 10,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  const first = await pacer.acquire("https://manual.example.edu/a");
  assert.equal(first.startedAt, 100);
  assert.equal(pacer.evaluate("https://manual.example.edu/b").active, true);
  first.release();
  first.release();
  const second = await pacer.acquire("https://manual.example.edu/b");
  assert.equal(second.startedAt, 110);
  second.release();
  assert.equal(pacer.nextEligibleAt("https://manual.example.edu/c"), 120);
});

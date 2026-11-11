import test from "node:test";
import assert from "node:assert/strict";
import {
  createCronLock,
  executeScheduledJobRunner,
  executeScheduledJobs,
} from "../src/jobs/cron-runner";

const now = new Date("2026-11-10T09:00:00.000Z");
const context = { now, dryRun: false };

test("authorized jobs run, report audited outcomes and count affected records", async () => {
  const audited: unknown[] = [];
  const record = await executeScheduledJobRunner("digest_dispatch", context, {
    jobKey: "job-secret",
    expectedJobKey: "job-secret",
    now,
    audit: (value) => {
      audited.push(value);
    },
    definitions: {
      digest_dispatch: {
        name: "digest_dispatch",
        schedule: () => true,
        handler: () => ({ affected: 4 }),
      },
    },
  });
  assert.equal(record.jobName, "digest_dispatch");
  assert.equal(record.status, "executed");
  assert.equal(record.outcome, "SUCCESS");
  assert.equal(record.affected, 4);
  assert.equal(record.failed, 0);
  assert.equal(record.dryRun, false);
  assert.ok(record.durationMs >= 0);
  assert.match(record.startedAt, /Z$/);
  assert.match(record.finishedAt, /Z$/);
  assert.equal(audited.length, 1);
  assert.deepEqual(audited[0], record);
});

test("unauthorized and unknown job triggers are rejected", async () => {
  await assert.rejects(
    executeScheduledJobRunner("digest_dispatch", context, { now }),
    /valid job key or operator context/,
  );
  await assert.rejects(
    executeScheduledJobRunner("digest_dispatch", context, {
      jobKey: "wrong",
      expectedJobKey: "job-secret",
      now,
    }),
    /valid job key or operator context/,
  );
  await assert.rejects(
    executeScheduledJobRunner("unknown_job", context, {
      operatorId: "operator",
      now,
    }),
    /Unknown scheduled job/,
  );
  await assert.rejects(
    executeScheduledJobRunner("digest_dispatch", context, {
      operatorId: "operator",
      verifyOperator: () => false,
      now,
    }),
    /valid job key or operator context/,
  );
  const operator = await executeScheduledJobRunner("digest_dispatch", context, {
    operatorId: "operator",
    now,
    definitions: {
      digest_dispatch: {
        name: "digest_dispatch",
        schedule: () => true,
        handler: () => ({ affected: 1 }),
      },
    },
  });
  assert.equal(operator.status, "executed");
});

test("overlapping runs of the same job never execute concurrently", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let running = 0;
  let overlapped = false;
  const definition = {
    name: "reminder_recheck" as const,
    schedule: () => true,
    handler: async () => {
      running++;
      if (running > 1) overlapped = true;
      await gate;
      running--;
      return { affected: 2 };
    },
  };
  const options = {
    operatorId: "operator",
    now,
    definitions: { reminder_recheck: definition },
  };
  const first = executeScheduledJobRunner("reminder_recheck", context, options);
  await new Promise((resolve) => setImmediate(resolve));
  const second = await executeScheduledJobRunner(
    "reminder_recheck",
    context,
    options,
  );
  assert.equal(second.status, "blocked");
  assert.equal(second.reason, "already_running");
  assert.equal(second.outcome, "SUCCESS");
  assert.equal(second.affected, 0);
  release();
  const completed = await first;
  assert.equal(completed.status, "executed");
  assert.equal(overlapped, false);
});

test("dry runs report planned actions without invoking the handler", async () => {
  let invoked = false;
  const record = await executeScheduledJobRunner("retention_sweep", context, {
    operatorId: "operator",
    now,
    dryRun: true,
    definitions: {
      retention_sweep: {
        name: "retention_sweep",
        schedule: () => true,
        handler: () => {
          invoked = true;
          return { affected: 9 };
        },
      },
    },
  });
  assert.equal(record.status, "skipped");
  assert.equal(record.reason, "dry_run");
  assert.equal(record.dryRun, true);
  assert.deepEqual(record.planned, {
    jobName: "retention_sweep",
    wouldRun: true,
  });
  assert.equal(invoked, false);
});

test("failing jobs are isolated and reported as failures", async () => {
  const record = await executeScheduledJobRunner("digest_dispatch", context, {
    operatorId: "operator",
    now,
    definitions: {
      digest_dispatch: {
        name: "digest_dispatch",
        schedule: () => true,
        handler: () => {
          throw new Error("provider unavailable");
        },
      },
    },
  });
  assert.equal(record.status, "failed");
  assert.equal(record.outcome, "FAILURE");
  assert.match(String(record.error), /provider unavailable/);
  assert.equal(record.affected, 0);

  const partial = await executeScheduledJobRunner("digest_dispatch", context, {
    operatorId: "operator",
    now,
    definitions: {
      digest_dispatch: {
        name: "digest_dispatch",
        schedule: () => true,
        handler: () => ({ affected: 3, failed: 1 }),
      },
    },
  });
  assert.equal(partial.outcome, "PARTIAL");
  assert.equal(partial.affected, 3);
  assert.equal(partial.failed, 1);

  const records = await executeScheduledJobs(
    ["digest_dispatch", "reminder_recheck", "retention_sweep"],
    context,
    {
      operatorId: "operator",
      now,
      definitions: {
        digest_dispatch: {
          name: "digest_dispatch",
          schedule: () => true,
          handler: () => {
            throw new Error("digest failed");
          },
        },
        reminder_recheck: {
          name: "reminder_recheck",
          schedule: () => true,
          handler: () => ({ affected: 5 }),
        },
      },
    },
  );
  assert.equal(records.length, 3);
  assert.equal(records[0].outcome, "FAILURE");
  assert.equal(records[1].outcome, "SUCCESS");
  assert.equal(records[1].affected, 5);
  assert.equal(records[2].status, "skipped");
});

test("schedule criteria skip jobs that are not yet due", async () => {
  let invoked = false;
  const record = await executeScheduledJobRunner("retention_sweep", context, {
    operatorId: "operator",
    now: new Date("2026-11-10T09:00:00.000Z"),
    definitions: {
      retention_sweep: {
        name: "retention_sweep",
        schedule: (jobContext) => jobContext.now.getUTCDate() === 1,
        handler: () => {
          invoked = true;
          return { affected: 1 };
        },
      },
    },
  });
  assert.equal(record.status, "skipped");
  assert.equal(record.reason, "not_due");
  assert.equal(invoked, false);
});

test("the shared lock refuses a second holder until it is released", () => {
  const lock = createCronLock();
  assert.equal(lock.tryAcquire("job"), true);
  assert.equal(lock.tryAcquire("job"), false);
  lock.release("job");
  assert.equal(lock.tryAcquire("job"), true);
});

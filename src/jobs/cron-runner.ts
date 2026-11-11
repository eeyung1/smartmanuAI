import { timingSafeEqual } from "node:crypto";

export class CronRunnerError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CronRunnerError";
  }
}

export type CronJobName =
  "digest_dispatch" | "reminder_recheck" | "retention_sweep";

export type CronOutcome = "SUCCESS" | "PARTIAL" | "FAILURE";
export type CronStatus = "executed" | "skipped" | "blocked" | "failed";

export type CronJobContext = {
  now: Date;
  dryRun: boolean;
  operatorId?: string;
  jobKey?: string;
};

export type CronJobHandlerResult = {
  affected?: number;
  failed?: number;
  outcome?: "SUCCESS" | "PARTIAL";
};

export type CronJobHandler = (
  context: CronJobContext,
) => Promise<CronJobHandlerResult | void> | CronJobHandlerResult | void;

export type CronJobDefinition = {
  name: CronJobName;
  /** Returns true when the job is due at the current time. */
  schedule?: (context: CronJobContext) => boolean;
  handler: CronJobHandler;
};

export type CronLock = {
  tryAcquire(key: string): boolean;
  release(key: string): void;
};

export type CronAuditRecord = {
  jobName: CronJobName;
  status: CronStatus;
  outcome: CronOutcome;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  affected: number;
  failed: number;
  dryRun: boolean;
  reason?: string;
  error?: string;
  planned?: { jobName: CronJobName; wouldRun: boolean };
};

export type CronRunnerOptions = {
  jobKey?: string;
  expectedJobKey?: string;
  operatorId?: string;
  dryRun?: boolean;
  now?: Date;
  definitions?: Partial<Record<CronJobName, CronJobDefinition>>;
  lock?: CronLock;
  audit?: (record: CronAuditRecord) => Promise<void> | void;
  /** Optional extra check for operator context, for example an administrator lookup. */
  verifyOperator?: (operatorId: string) => Promise<boolean> | boolean;
};

const jobNames: CronJobName[] = [
  "digest_dispatch",
  "reminder_recheck",
  "retention_sweep",
];

/** Process-local overlap guard; hosted runners use one instance per process. */
export function createCronLock(): CronLock {
  const held = new Set<string>();
  return {
    tryAcquire(key) {
      if (held.has(key)) return false;
      held.add(key);
      return true;
    },
    release(key) {
      held.delete(key);
    },
  };
}

// One guard per process so overlapping invocations of the same job cannot run
// concurrently even when each call supplies no explicit lock.
const processLock = createCronLock();

const hourlyTick = (context: CronJobContext) =>
  context.now.getUTCMinutes() === 0;
const monthlySweep = (context: CronJobContext) =>
  context.now.getUTCDate() === 1 && context.now.getUTCHours() === 3;

export const defaultCronDefinitions: Record<CronJobName, CronJobDefinition> = {
  digest_dispatch: {
    name: "digest_dispatch",
    schedule: hourlyTick,
    handler: () => ({ affected: 0 }),
  },
  reminder_recheck: {
    name: "reminder_recheck",
    schedule: hourlyTick,
    handler: () => ({ affected: 0 }),
  },
  retention_sweep: {
    name: "retention_sweep",
    schedule: monthlySweep,
    handler: () => ({ affected: 0 }),
  },
};

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function authorized(options: CronRunnerOptions) {
  if (
    options.jobKey &&
    options.expectedJobKey &&
    sameSecret(options.jobKey, options.expectedJobKey)
  )
    return true;
  if (options.operatorId) {
    if (!options.verifyOperator) return true;
    return (await options.verifyOperator(options.operatorId)) === true;
  }
  return false;
}

function resolveDefinition(
  jobName: CronJobName,
  options: CronRunnerOptions,
): CronJobDefinition {
  const definition = options.definitions?.[jobName];
  return definition ?? defaultCronDefinitions[jobName];
}

/**
 * Runs one registered recurring job with authorization, overlap protection and
 * a structured audit record. Job failures are captured, never thrown, so one
 * failing job cannot crash the surrounding scheduled run.
 */
export async function executeScheduledJobRunner(
  jobName: string,
  context: CronJobContext | Record<string, unknown> = {},
  options: CronRunnerOptions = {},
): Promise<CronAuditRecord> {
  if (!jobNames.includes(jobName as CronJobName))
    throw new CronRunnerError(400, `Unknown scheduled job: ${jobName}.`);
  const name = jobName as CronJobName;
  const now = options.now ?? (context as { now?: Date }).now ?? new Date();
  if (!Number.isFinite(now.getTime()))
    throw new CronRunnerError(400, "Invalid scheduled job time.");
  const dryRun =
    options.dryRun === true ||
    (context as { dryRun?: boolean }).dryRun === true;
  const operatorId =
    options.operatorId ?? (context as { operatorId?: string }).operatorId;
  const jobKey = options.jobKey ?? (context as { jobKey?: string }).jobKey;
  if (!(await authorized({ ...options, operatorId, jobKey })))
    throw new CronRunnerError(
      403,
      "Scheduled job execution requires a valid job key or operator context.",
    );

  const definition = resolveDefinition(name, options);
  const jobContext: CronJobContext = {
    now,
    dryRun,
    ...(operatorId ? { operatorId } : {}),
    ...(jobKey ? { jobKey } : {}),
  };
  const startedAt = new Date();
  const begin = Date.now();
  const lock = options.lock ?? processLock;
  const finish = (
    record: Omit<
      CronAuditRecord,
      "jobName" | "startedAt" | "finishedAt" | "durationMs"
    >,
  ): CronAuditRecord => {
    const finished = new Date();
    return {
      jobName: name,
      startedAt: startedAt.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: Math.max(0, Date.now() - begin),
      ...record,
    };
  };

  const due = definition.schedule ? definition.schedule(jobContext) : true;
  if (!due) {
    const record = finish({
      status: "skipped",
      outcome: "SUCCESS",
      affected: 0,
      failed: 0,
      dryRun,
      reason: "not_due",
    });
    if (options.audit) await options.audit(record);
    return record;
  }

  if (dryRun) {
    const record = finish({
      status: "skipped",
      outcome: "SUCCESS",
      affected: 0,
      failed: 0,
      dryRun: true,
      reason: "dry_run",
      planned: { jobName: name, wouldRun: true },
    });
    if (options.audit) await options.audit(record);
    return record;
  }

  if (!lock.tryAcquire(name)) {
    const record = finish({
      status: "blocked",
      outcome: "SUCCESS",
      affected: 0,
      failed: 0,
      dryRun,
      reason: "already_running",
    });
    if (options.audit) await options.audit(record);
    return record;
  }

  try {
    const result = (await definition.handler(jobContext)) ?? {};
    const affected = Number.isFinite(result.affected)
      ? Number(result.affected)
      : 0;
    const failed = Number.isFinite(result.failed) ? Number(result.failed) : 0;
    const outcome: CronOutcome =
      result.outcome ?? (failed > 0 ? "PARTIAL" : "SUCCESS");
    const record = finish({
      status: "executed",
      outcome,
      affected,
      failed,
      dryRun,
    });
    if (options.audit) await options.audit(record);
    return record;
  } catch (error) {
    const record = finish({
      status: "failed",
      outcome: "FAILURE",
      affected: 0,
      failed: 1,
      dryRun,
      error: error instanceof Error ? error.message : String(error),
    });
    if (options.audit) await options.audit(record);
    return record;
  } finally {
    lock.release(name);
  }
}

/** Runs several jobs in sequence, isolating a failing job from the others. */
export async function executeScheduledJobs(
  jobNamesToRun: readonly string[],
  context: CronJobContext | Record<string, unknown> = {},
  options: CronRunnerOptions = {},
): Promise<CronAuditRecord[]> {
  const records: CronAuditRecord[] = [];
  for (const name of jobNamesToRun) {
    try {
      records.push(await executeScheduledJobRunner(name, context, options));
    } catch (error) {
      records.push({
        jobName: name as CronJobName,
        status: "failed",
        outcome: "FAILURE",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        affected: 0,
        failed: 1,
        dryRun: options.dryRun === true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return records;
}

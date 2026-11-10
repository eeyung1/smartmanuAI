export const MAX_HOST_PACER_DELAY_SECONDS = 3600;

export type HostPacerOptions = {
  minimumIntervalMs?: number;
  minIntervalMs?: number;
  /** Alias retained for callers that describe the floor as a delay. */
  minimumDelayMs?: number;
  now?: () => number | Date;
  clock?: () => number | Date;
  sleep?: (milliseconds: number) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
};

export type HostPaceOptions = {
  crawlDelaySeconds?: number | null;
};

export type HostPaceStatus = {
  host: string;
  eligible: boolean;
  active: boolean;
  queued: number;
  lastStartedAt: number | null;
  nextEligibleAt: number;
  waitMs: number;
  intervalMs: number;
};

type HostState = {
  lastStartedAt: number | null;
  intervalMs: number;
  active: boolean;
  queued: number;
  tail: Promise<void>;
};

function milliseconds(value: number | undefined, label: string) {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value))
    throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

function paceOptions(value?: number | HostPaceOptions | null): HostPaceOptions {
  return typeof value === "number"
    ? { crawlDelaySeconds: value }
    : (value ?? {});
}

export function normalizeHostKey(value: string | URL) {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new Error("Host pacing requires an absolute URL.");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Host pacing supports HTTP(S) URLs only.");
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!hostname) throw new Error("Host pacing requires a hostname.");
  // URL.port is already empty for protocol-default ports.
  return url.port ? `${hostname}:${url.port}` : hostname;
}

/** In-memory, process-local host pacing. Durable/multi-process locks remain separate. */
export function createHostPacer(options: HostPacerOptions = {}) {
  const floor =
    milliseconds(
      options.minimumIntervalMs ??
        options.minIntervalMs ??
        options.minimumDelayMs ??
        1_000,
      "minimumIntervalMs",
    ) ?? 1_000;
  const clock = options.now ?? options.clock ?? Date.now;
  const sleeper =
    options.sleep ??
    options.wait ??
    ((duration: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, duration)));
  const states = new Map<string, HostState>();

  const currentTime = () => {
    const value = clock();
    const timestamp = value instanceof Date ? value.getTime() : value;
    if (!Number.isFinite(timestamp))
      throw new Error("Host pacer clock is invalid.");
    return timestamp;
  };
  const stateFor = (host: string) => {
    let state = states.get(host);
    if (!state) {
      state = {
        lastStartedAt: null,
        intervalMs: floor,
        active: false,
        queued: 0,
        tail: Promise.resolve(),
      };
      states.set(host, state);
    }
    return state;
  };
  const intervalFor = (
    value?: number | HostPaceOptions | null,
    fallback = floor,
  ) => {
    const crawlDelay = paceOptions(value).crawlDelaySeconds;
    if (crawlDelay === undefined || crawlDelay === null) return fallback;
    if (!Number.isFinite(crawlDelay) || crawlDelay < 0)
      throw new Error("crawlDelaySeconds must be non-negative.");
    return Math.max(
      floor,
      Math.ceil(Math.min(crawlDelay, MAX_HOST_PACER_DELAY_SECONDS) * 1_000),
    );
  };

  const evaluate = (
    value: string | URL,
    request?: number | HostPaceOptions | null,
  ): HostPaceStatus => {
    const host = normalizeHostKey(value);
    const state = states.get(host);
    const now = currentTime();
    const intervalMs = intervalFor(request, state?.intervalMs);
    const lastStartedAt = state?.lastStartedAt ?? null;
    const nextEligibleAt =
      lastStartedAt === null ? now : lastStartedAt + intervalMs;
    const waitMs = Math.max(0, nextEligibleAt - now);
    const active = state?.active ?? false;
    const queued = state?.queued ?? 0;
    return {
      host,
      eligible: !active && queued === 0 && waitMs === 0,
      active,
      queued,
      lastStartedAt,
      nextEligibleAt,
      waitMs,
      intervalMs,
    };
  };

  const acquire = async (
    value: string | URL,
    request?: number | HostPaceOptions | null,
  ) => {
    const host = normalizeHostKey(value);
    const state = stateFor(host);
    const predecessor = state.tail;
    let open!: () => void;
    state.tail = new Promise<void>((resolve) => {
      open = resolve;
    });
    state.queued++;
    await predecessor;
    state.queued--;
    try {
      const intervalMs = intervalFor(request, state.intervalMs);
      const now = currentTime();
      const eligibleAt =
        state.lastStartedAt === null ? now : state.lastStartedAt + intervalMs;
      const waitMs = Math.max(0, eligibleAt - now);
      if (waitMs) await sleeper(waitMs);
      const startedAt = Math.max(currentTime(), eligibleAt);
      state.lastStartedAt = startedAt;
      state.intervalMs = intervalMs;
      state.active = true;
      let released = false;
      return {
        host,
        startedAt,
        intervalMs,
        release() {
          if (released) return;
          released = true;
          state.active = false;
          open();
        },
      };
    } catch (error) {
      open();
      throw error;
    }
  };

  const schedule = async <T>(
    value: string | URL,
    taskOrRequest: (() => Promise<T> | T) | number | HostPaceOptions,
    requestOrTask?: number | HostPaceOptions | null | (() => Promise<T> | T),
  ) => {
    const task =
      typeof taskOrRequest === "function"
        ? taskOrRequest
        : typeof requestOrTask === "function"
          ? requestOrTask
          : null;
    if (!task) throw new Error("Host pacing requires a task function.");
    const request =
      typeof taskOrRequest === "function" ? requestOrTask : taskOrRequest;
    if (typeof request === "function")
      throw new Error("Host pacing request options are invalid.");
    const lease = await acquire(value, request);
    try {
      return await task();
    } finally {
      lease.release();
    }
  };

  return {
    normalizeHost: normalizeHostKey,
    evaluate,
    check: evaluate,
    nextEligibleAt(
      value: string | URL,
      request?: number | HostPaceOptions | null,
    ) {
      return evaluate(value, request).nextEligibleAt;
    },
    acquire,
    schedule,
    run: schedule,
    snapshot() {
      return [...states.keys()]
        .sort()
        .map((host) => evaluate(`https://${host}`));
    },
  };
}

export type HostStatus =
  | "AVAILABLE"
  | "RATE_LIMITED"
  | "COOLING_DOWN"
  | "MAX_RETRIES_EXCEEDED"
  | "UNKNOWN";

export type HostLease = {
  id: string;
  hostname: string;
  expiresAt: number;
};

export type HostState = {
  hostname: string;
  lastRequestAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  retryAfterUntil: number | null;
  leases: HostLease[];
};

export type HostCoordinatorOptions = {
  now?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxFailures?: number;
  leaseTtlMs?: number;
  maxConcurrentLeases?: number;
  backoffScheduleMs?: readonly number[];
};

export type HostAvailability = {
  hostname: string;
  eligible: boolean;
  status: HostStatus;
  reason: string;
  cooldownUntil: number | null;
  waitMs: number;
  activeLeases: number;
  consecutiveFailures: number;
};

export type HostLeaseResult = {
  granted: boolean;
  reason: string;
  lease: HostLease | null;
  availability: HostAvailability;
};

export const DEFAULT_BACKOFF_SCHEDULE_MS = [
  10_000, 30_000, 120_000, 600_000, 1_800_000,
] as const;

function defaultNow() {
  return Date.now();
}

export function normalizeHostname(value: unknown) {
  if (typeof value !== "string") return null;
  const host = value.normalize("NFKC").trim().toLowerCase().replace(/\.+$/, "");
  if (!host || host.length > 253) return null;
  if (
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(
      host,
    )
  )
    return null;
  return host;
}

/** Escalating delay for the given number of consecutive failures. */
export function backoffDelayMs(
  consecutiveFailures: number,
  options: HostCoordinatorOptions = {},
) {
  const schedule = options.backoffScheduleMs ?? DEFAULT_BACKOFF_SCHEDULE_MS;
  const base = options.baseDelayMs ?? 10_000;
  const max = options.maxDelayMs ?? 1_800_000;
  if (!Number.isInteger(consecutiveFailures) || consecutiveFailures < 1)
    return 0;
  const step = schedule[Math.min(consecutiveFailures - 1, schedule.length - 1)];
  const delay = step ?? Math.min(base * 3 ** (consecutiveFailures - 1), max);
  return Math.min(Math.max(0, delay), max);
}

function emptyState(hostname: string): HostState {
  return {
    hostname,
    lastRequestAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    retryAfterUntil: null,
    leases: [],
  };
}

function liveLeases(state: HostState, now: number) {
  return state.leases.filter((lease) => lease.expiresAt > now);
}

/**
 * Pure availability check for one host. It never mutates the given state and
 * never throws for malformed input.
 */
export function evaluateHostAvailability(
  hostState: HostState | null | undefined,
  options: HostCoordinatorOptions = {},
): HostAvailability {
  const now = (options.now ?? defaultNow)();
  const maxFailures = options.maxFailures ?? 5;
  const hostname = normalizeHostname(hostState?.hostname);
  if (!hostname)
    return {
      hostname: "",
      eligible: false,
      status: "UNKNOWN",
      reason: "invalid_hostname",
      cooldownUntil: null,
      waitMs: 0,
      activeLeases: 0,
      consecutiveFailures: 0,
    };
  const state = hostState!;
  const activeLeases = liveLeases(state, now).length;
  const failures = Number.isInteger(state.consecutiveFailures)
    ? Math.max(0, state.consecutiveFailures)
    : 0;
  const base: Omit<HostAvailability, "status" | "reason" | "eligible"> = {
    hostname,
    cooldownUntil: null,
    waitMs: 0,
    activeLeases,
    consecutiveFailures: failures,
  };
  if (failures >= maxFailures)
    return {
      ...base,
      eligible: false,
      status: "MAX_RETRIES_EXCEEDED",
      reason: "max_retries_exceeded",
    };
  const retryAfterUntil =
    typeof state.retryAfterUntil === "number" &&
    Number.isFinite(state.retryAfterUntil) &&
    state.retryAfterUntil > now
      ? state.retryAfterUntil
      : null;
  if (retryAfterUntil) {
    return {
      ...base,
      eligible: false,
      status: "RATE_LIMITED",
      reason: "retry_after_active",
      cooldownUntil: retryAfterUntil,
      waitMs: retryAfterUntil - now,
    };
  }
  if (failures > 0) {
    const until = now + backoffDelayMs(failures, options);
    return {
      ...base,
      eligible: false,
      status: "COOLING_DOWN",
      reason: "exponential_backoff",
      cooldownUntil: until,
      waitMs: until - now,
    };
  }
  if (activeLeases >= (options.maxConcurrentLeases ?? 1))
    return {
      ...base,
      eligible: false,
      status: "COOLING_DOWN",
      reason: "lease_held",
      cooldownUntil: null,
      waitMs: 0,
    };
  return {
    ...base,
    eligible: true,
    status: "AVAILABLE",
    reason: "available",
  };
}

/** In-memory host cooldown coordinator with bounded leases. */
export function createHostCooldownCoordinator(
  options: HostCoordinatorOptions = {},
) {
  const now = options.now ?? defaultNow;
  const leaseTtlMs = options.leaseTtlMs ?? 60_000;
  const maxFailures = options.maxFailures ?? 5;
  const states = new Map<string, HostState>();
  let counter = 0;

  const stateFor = (hostname: string) => {
    let state = states.get(hostname);
    if (!state) {
      state = emptyState(hostname);
      states.set(hostname, state);
    }
    return state;
  };

  const evaluate = (hostname: unknown) => {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return evaluateHostAvailability(null, { ...options, now });
    const state = states.get(normalized) ?? emptyState(normalized);
    return evaluateHostAvailability(
      { ...state, leases: liveLeases(state, now()) },
      { ...options, now },
    );
  };

  const acquireHostLease = (hostname: unknown): HostLeaseResult => {
    const normalized = normalizeHostname(hostname);
    if (!normalized)
      return {
        granted: false,
        reason: "invalid_hostname",
        lease: null,
        availability: evaluateHostAvailability(null, { ...options, now }),
      };
    const state = stateFor(normalized);
    const timestamp = now();
    state.leases = liveLeases(state, timestamp);
    const availability = evaluateHostAvailability(
      { ...state, leases: state.leases },
      { ...options, now },
    );
    if (!availability.eligible)
      return {
        granted: false,
        reason: availability.reason,
        lease: null,
        availability,
      };
    counter += 1;
    const lease: HostLease = {
      id: `lease-${counter}-${timestamp}`,
      hostname: normalized,
      expiresAt: timestamp + leaseTtlMs,
    };
    state.leases.push(lease);
    state.lastRequestAt = timestamp;
    return {
      granted: true,
      reason: "granted",
      lease,
      availability: evaluateHostAvailability(state, { ...options, now }),
    };
  };

  const releaseHostLease = (hostname: unknown, leaseId: string) => {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return false;
    const state = states.get(normalized);
    if (!state) return false;
    const before = state.leases.length;
    state.leases = state.leases.filter((lease) => lease.id !== leaseId);
    return state.leases.length !== before;
  };

  const recordFailure = (
    hostname: unknown,
    failure: { retryAfterMs?: number | null } = {},
  ): HostAvailability => {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return evaluateHostAvailability(null, { ...options, now });
    const state = stateFor(normalized);
    const timestamp = now();
    state.consecutiveFailures += 1;
    state.lastFailureAt = timestamp;
    state.lastRequestAt = timestamp;
    const retryAfter =
      typeof failure.retryAfterMs === "number" &&
      Number.isFinite(failure.retryAfterMs) &&
      failure.retryAfterMs >= 0
        ? Math.min(failure.retryAfterMs, options.maxDelayMs ?? 1_800_000)
        : null;
    state.retryAfterUntil = retryAfter === null ? null : timestamp + retryAfter;
    return evaluateHostAvailability(state, { ...options, now });
  };

  const recordSuccess = (hostname: unknown): HostAvailability => {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return evaluateHostAvailability(null, { ...options, now });
    const state = stateFor(normalized);
    const timestamp = now();
    state.consecutiveFailures = 0;
    state.retryAfterUntil = null;
    state.lastRequestAt = timestamp;
    state.lastFailureAt = null;
    return evaluateHostAvailability(state, { ...options, now });
  };

  const snapshot = () =>
    [...states.keys()].sort().map((hostname) => {
      const state = states.get(hostname)!;
      return evaluateHostAvailability(
        { ...state, leases: liveLeases(state, now()) },
        { ...options, now },
      );
    });

  return {
    evaluate,
    evaluateHostAvailability: evaluate,
    acquireHostLease,
    releaseHostLease,
    recordFailure,
    recordSuccess,
    stateFor: (hostname: unknown) => {
      const normalized = normalizeHostname(hostname);
      return normalized ? (states.get(normalized) ?? null) : null;
    },
    snapshot,
    maxFailures,
    leaseTtlMs,
  };
}

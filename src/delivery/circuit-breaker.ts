import { randomUUID } from "node:crypto";
import type { DeliveryIntent } from "./intent-queue";

export type CircuitChannel = "email" | "telegram";
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type CircuitOptions = {
  now?: () => number;
  /** Consecutive provider failures that trip the channel. */
  failureThreshold?: number;
  /** How long the channel stays OPEN before a probe is allowed. */
  cooldownMs?: number;
};

export type CircuitEvaluation = {
  channel: CircuitChannel;
  state: CircuitState;
  consecutiveFailures: number;
  allowRequest: boolean;
  openedUntil: string | null;
  reason: string;
  probeInFlight: boolean;
};

export type DeliveryOutcome = {
  status: "accepted" | "retry" | "failed" | "suppressed";
  code?: string | null;
  /** A non-retryable recipient error is not a provider failure. */
  retryable?: boolean;
};

export type DeadLetterEntry = {
  id: string;
  intentId: string;
  userId: string;
  channel: CircuitChannel;
  recipient: string;
  payloadRef: string;
  template: string;
  reason: string;
  code: string | null;
  attempts: number;
  maxAttempts: number;
  routedAt: number;
};

export type DeadLetterCriteria = {
  channel?: CircuitChannel;
  limit?: number;
};

export type RouteResult = {
  ok: boolean;
  reason: string;
  entry: DeadLetterEntry | null;
};

export type ReplayResult = {
  ok: boolean;
  reason: string;
  replayed: DeadLetterEntry[];
  skipped: number;
};

const channels: CircuitChannel[] = ["email", "telegram"];

function isChannel(value: unknown): value is CircuitChannel {
  return (
    typeof value === "string" && (channels as readonly string[]).includes(value)
  );
}

function text(value: unknown, limit = 500) {
  if (typeof value !== "string") return "";
  return value.slice(0, limit);
}

/** In-memory delivery circuit breaker and dead-letter queue manager. */
export function createDeliveryCircuitBreaker(options: CircuitOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const failureThreshold = options.failureThreshold ?? 5;
  const cooldownMs = options.cooldownMs ?? 900_000;
  if (
    !Number.isInteger(failureThreshold) ||
    failureThreshold < 1 ||
    failureThreshold > 100
  )
    throw new Error("Circuit failure threshold is invalid.");
  if (
    !Number.isInteger(cooldownMs) ||
    cooldownMs < 0 ||
    cooldownMs > 86_400_000
  )
    throw new Error("Circuit cooldown is invalid.");

  type ChannelState = {
    state: CircuitState;
    consecutiveFailures: number;
    openedUntil: number | null;
    probeInFlight: boolean;
    lastOutcome: DeliveryOutcome | null;
  };
  const channelsState = new Map<CircuitChannel, ChannelState>();
  const deadLetters = new Map<string, DeadLetterEntry>();

  const stateFor = (channel: CircuitChannel): ChannelState => {
    let state = channelsState.get(channel);
    if (!state) {
      state = {
        state: "CLOSED",
        consecutiveFailures: 0,
        openedUntil: null,
        probeInFlight: false,
        lastOutcome: null,
      };
      channelsState.set(channel, state);
    }
    return state;
  };

  const evaluateCircuitState = (
    channel: unknown,
    evaluateOptions: CircuitOptions = {},
  ): CircuitEvaluation => {
    if (!isChannel(channel))
      return {
        channel: "email",
        state: "CLOSED",
        consecutiveFailures: 0,
        allowRequest: false,
        openedUntil: null,
        reason: "invalid_channel",
        probeInFlight: false,
      };
    const state = stateFor(channel);
    const timestamp = (evaluateOptions.now ?? now)();
    if (state.state === "OPEN") {
      if (state.openedUntil !== null && timestamp >= state.openedUntil) {
        state.state = "HALF_OPEN";
        state.probeInFlight = false;
        state.openedUntil = null;
      } else
        return {
          channel,
          state: "OPEN",
          consecutiveFailures: state.consecutiveFailures,
          allowRequest: false,
          openedUntil:
            state.openedUntil === null
              ? null
              : new Date(state.openedUntil).toISOString(),
          reason: "cooldown_active",
          probeInFlight: false,
        };
    }
    if (state.state === "HALF_OPEN")
      return {
        channel,
        state: "HALF_OPEN",
        consecutiveFailures: state.consecutiveFailures,
        allowRequest: !state.probeInFlight,
        openedUntil: null,
        reason: state.probeInFlight ? "probe_in_flight" : "probe_allowed",
        probeInFlight: state.probeInFlight,
      };
    return {
      channel,
      state: "CLOSED",
      consecutiveFailures: state.consecutiveFailures,
      allowRequest: true,
      openedUntil: null,
      reason: "closed",
      probeInFlight: false,
    };
  };

  const recordDeliveryOutcome = (
    channel: unknown,
    outcome: unknown,
    outcomeOptions: CircuitOptions = {},
  ): CircuitEvaluation => {
    if (!isChannel(channel))
      return {
        channel: "email",
        state: "CLOSED",
        consecutiveFailures: 0,
        allowRequest: false,
        openedUntil: null,
        reason: "invalid_channel",
        probeInFlight: false,
      };
    const value = (outcome ?? {}) as DeliveryOutcome;
    if (
      !value ||
      !["accepted", "retry", "failed", "suppressed"].includes(value.status)
    )
      return {
        ...evaluateCircuitState(channel, outcomeOptions),
        reason: "invalid_outcome",
      };
    const state = stateFor(channel);
    const timestamp = (outcomeOptions.now ?? now)();
    state.lastOutcome = value;
    if (value.status === "accepted") {
      state.state = "CLOSED";
      state.consecutiveFailures = 0;
      state.openedUntil = null;
      state.probeInFlight = false;
      return evaluateCircuitState(channel, outcomeOptions);
    }
    if (value.status === "suppressed") {
      // A suppressed delivery is a user-side decision, not provider health.
      state.probeInFlight = false;
      return evaluateCircuitState(channel, outcomeOptions);
    }
    if (value.retryable === false) {
      // A fatal recipient error does not indicate provider failure.
      state.probeInFlight = false;
      return evaluateCircuitState(channel, outcomeOptions);
    }
    state.consecutiveFailures += 1;
    if (state.state === "HALF_OPEN") {
      state.state = "OPEN";
      state.openedUntil = timestamp + cooldownMs;
      state.probeInFlight = false;
      return evaluateCircuitState(channel, outcomeOptions);
    }
    if (state.consecutiveFailures >= failureThreshold) {
      state.state = "OPEN";
      state.openedUntil = timestamp + cooldownMs;
      state.probeInFlight = false;
      return evaluateCircuitState(channel, outcomeOptions);
    }
    state.probeInFlight = false;
    return evaluateCircuitState(channel, outcomeOptions);
  };

  const beginProbe = (channel: unknown) => {
    if (!isChannel(channel)) return { ok: false, reason: "invalid_channel" };
    const evaluation = evaluateCircuitState(channel);
    if (!evaluation.allowRequest)
      return { ok: false, reason: evaluation.reason };
    const state = stateFor(channel);
    if (state.state === "HALF_OPEN") state.probeInFlight = true;
    return { ok: true, reason: "probe_started" };
  };

  const routeToDeadLetterQueue = (
    intent: unknown,
    reason: unknown,
    routeOptions: { fatal?: boolean } = {},
  ): RouteResult => {
    const value = intent as DeliveryIntent | null;
    if (!value || typeof value.id !== "string" || !value.id)
      return { ok: false, reason: "invalid_intent", entry: null };
    if (!isChannel(value.channel))
      return { ok: false, reason: "invalid_channel", entry: null };
    const exhausted =
      Number.isInteger(value.attempts) &&
      Number.isInteger(value.maxAttempts) &&
      value.attempts >= value.maxAttempts;
    const fatal = routeOptions.fatal === true;
    if (!exhausted && !fatal)
      return { ok: false, reason: "not_exhausted", entry: null };
    if (deadLetters.has(value.id))
      return {
        ok: false,
        reason: "already_routed",
        entry: { ...deadLetters.get(value.id)! },
      };
    const entry: DeadLetterEntry = {
      id: randomUUID(),
      intentId: value.id,
      userId: text(value.userId, 200),
      channel: value.channel,
      recipient: text(value.recipient, 320),
      payloadRef: text(value.payloadRef, 500),
      template: text(value.template, 100),
      reason:
        text(reason, 300) ||
        (fatal ? "fatal_recipient_error" : "retries_exhausted"),
      code: text((value as { lastError?: unknown }).lastError, 300) || null,
      attempts: Number.isInteger(value.attempts) ? value.attempts : 0,
      maxAttempts: Number.isInteger(value.maxAttempts) ? value.maxAttempts : 0,
      routedAt: now(),
    };
    deadLetters.set(value.id, entry);
    return { ok: true, reason: "routed", entry: { ...entry } };
  };

  const replayDeadLetterQueue = (
    criteria: DeadLetterCriteria = {},
    replayOptions: { now?: () => number } = {},
  ): ReplayResult => {
    const limit = criteria.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      return { ok: false, reason: "invalid_limit", replayed: [], skipped: 0 };
    if (criteria.channel !== undefined && !isChannel(criteria.channel))
      return { ok: false, reason: "invalid_channel", replayed: [], skipped: 0 };
    const replayed: DeadLetterEntry[] = [];
    let skipped = 0;
    for (const [intentId, entry] of deadLetters) {
      if (replayed.length >= limit) break;
      if (criteria.channel && entry.channel !== criteria.channel) continue;
      const evaluation = evaluateCircuitState(entry.channel, replayOptions);
      if (!evaluation.allowRequest) {
        skipped++;
        continue;
      }
      deadLetters.delete(intentId);
      replayed.push({ ...entry });
    }
    return {
      ok: true,
      reason: replayed.length ? "replayed" : "nothing_to_replay",
      replayed,
      skipped,
    };
  };

  return {
    evaluateCircuitState,
    recordDeliveryOutcome,
    beginProbe,
    routeToDeadLetterQueue,
    replayDeadLetterQueue,
    deadLetters: () => [...deadLetters.values()].map((entry) => ({ ...entry })),
    channelState: (channel: unknown) =>
      isChannel(channel) ? { ...stateFor(channel) } : null,
    failureThreshold,
    cooldownMs,
  };
}

export type DeliveryCircuitBreaker = ReturnType<
  typeof createDeliveryCircuitBreaker
>;

let defaultBreaker: DeliveryCircuitBreaker | null = null;

export function deliveryCircuitBreaker(options: CircuitOptions = {}) {
  defaultBreaker ??= createDeliveryCircuitBreaker(options);
  return defaultBreaker;
}

export function evaluateCircuitState(
  channel: CircuitChannel,
  options: CircuitOptions = {},
) {
  return deliveryCircuitBreaker(options).evaluateCircuitState(channel, options);
}

export function recordDeliveryOutcome(
  channel: CircuitChannel,
  outcome: DeliveryOutcome,
  options: CircuitOptions = {},
) {
  return deliveryCircuitBreaker(options).recordDeliveryOutcome(
    channel,
    outcome,
    options,
  );
}

export function routeToDeadLetterQueue(
  intent: DeliveryIntent,
  reason: string,
  options: { fatal?: boolean } = {},
) {
  return deliveryCircuitBreaker().routeToDeadLetterQueue(
    intent,
    reason,
    options,
  );
}

export function replayDeadLetterQueue(
  criteria: DeadLetterCriteria = {},
  options: { now?: () => number } = {},
) {
  return deliveryCircuitBreaker().replayDeadLetterQueue(criteria, options);
}

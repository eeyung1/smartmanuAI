import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { z } from "zod";

export type DeliveryChannel = "email" | "telegram";

export type DeliveryIntentStatus =
  | "PENDING"
  | "DISPATCHING"
  | "DELIVERED"
  | "FAILED"
  | "SUPPRESSED"
  | "DEAD_LETTER";

export type DeliveryIntent = {
  id: string;
  userId: string;
  channel: DeliveryChannel;
  template: string;
  recipient: string;
  payloadRef: string;
  dedupeKey: string;
  status: DeliveryIntentStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  availableAt: number;
  leaseToken: string | null;
  leaseUntil: number | null;
  receipt: string | null;
  lastError: string | null;
  suppressionReason: string | null;
};

export type DeliveryIntentInput = {
  userId: string;
  channel: DeliveryChannel;
  template: string;
  recipient: string;
  payloadRef: string;
  dedupeKey?: string;
  maxAttempts?: number;
};

export type DeliveryQueueOptions = {
  now?: () => number;
  leaseTtlMs?: number;
  maxAttempts?: number;
  channelFailureThreshold?: number;
  channelPauseMs?: number;
  backoffScheduleMs?: readonly number[];
  idFactory?: () => string;
};

export type DeliveryTransitionResult = {
  ok: boolean;
  reason: string;
  intent: DeliveryIntent | null;
};

const intentInputSchema = z
  .object({
    userId: z.string().trim().min(1).max(200),
    channel: z.enum(["email", "telegram"]),
    template: z.string().trim().min(1).max(80),
    recipient: z.string().trim().min(1).max(320),
    payloadRef: z.string().trim().min(1).max(500),
    dedupeKey: z.string().trim().min(1).max(200).optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export const DEFAULT_DELIVERY_BACKOFF_MS = [
  60_000, 300_000, 900_000, 3_600_000, 21_600_000,
] as const;

function defaultNow() {
  return Date.now();
}

function backoffDelayMs(attempts: number, schedule: readonly number[]) {
  if (attempts < 1) return 0;
  const step = schedule[Math.min(attempts - 1, schedule.length - 1)];
  return Math.max(0, step ?? 60_000);
}

function dedupeKeyFor(input: DeliveryIntentInput) {
  if (input.dedupeKey) return input.dedupeKey;
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.userId,
        input.channel,
        input.template,
        input.recipient,
        input.payloadRef,
      ]),
    )
    .digest("hex");
}

/** In-memory delivery intent queue with leases, retry backoff and channel circuit breaking. */
export function createDeliveryIntentQueue(options: DeliveryQueueOptions = {}) {
  const now = options.now ?? defaultNow;
  const leaseTtlMs = options.leaseTtlMs ?? 60_000;
  const defaultMaxAttempts = options.maxAttempts ?? 5;
  const failureThreshold = options.channelFailureThreshold ?? 5;
  const channelPauseMs = options.channelPauseMs ?? 900_000;
  const backoffSchedule =
    options.backoffScheduleMs ?? DEFAULT_DELIVERY_BACKOFF_MS;
  const idFactory = options.idFactory ?? (() => randomUUID());
  const intents = new Map<string, DeliveryIntent>();
  const byDedupeKey = new Map<string, string>();
  const channelFailures = new Map<DeliveryChannel, number>();
  const channelPausedUntil = new Map<DeliveryChannel, number>();

  const isChannelPaused = (channel: DeliveryChannel) => {
    const pausedUntil = channelPausedUntil.get(channel) ?? 0;
    const current = now();
    if (pausedUntil > current) return true;
    if (pausedUntil) {
      channelPausedUntil.delete(channel);
      channelFailures.set(channel, 0);
    }
    return false;
  };

  const noteChannelFailure = (channel: DeliveryChannel) => {
    const failures = (channelFailures.get(channel) ?? 0) + 1;
    channelFailures.set(channel, failures);
    if (failures >= failureThreshold) {
      channelPausedUntil.set(channel, now() + channelPauseMs);
      channelFailures.set(channel, 0);
    }
  };

  const noteChannelSuccess = (channel: DeliveryChannel) => {
    channelFailures.set(channel, 0);
    channelPausedUntil.delete(channel);
  };

  const enqueueDeliveryIntent = (
    input: unknown,
    queueOptions: { maxAttempts?: number } = {},
  ) => {
    const value = intentInputSchema.parse(input);
    if (value.channel === "email") {
      if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.recipient))
        throw new Error("Invalid email recipient.");
    } else if (!/^[1-9]\d{0,15}$/.test(value.recipient))
      throw new Error("Invalid Telegram chat recipient.");
    if (/^[[{]/.test(value.payloadRef))
      throw new Error(
        "Payload references must point to stored encrypted payloads, not raw content.",
      );
    const dedupeKey = dedupeKeyFor(value);
    const existingId = byDedupeKey.get(dedupeKey);
    if (existingId) {
      const existing = intents.get(existingId)!;
      return { created: false, intent: { ...existing } };
    }
    const timestamp = now();
    const intent: DeliveryIntent = {
      id: idFactory(),
      userId: value.userId,
      channel: value.channel,
      template: value.template,
      recipient: value.recipient,
      payloadRef: value.payloadRef,
      dedupeKey,
      status: "PENDING",
      attempts: 0,
      maxAttempts:
        value.maxAttempts ?? queueOptions.maxAttempts ?? defaultMaxAttempts,
      createdAt: timestamp,
      updatedAt: timestamp,
      availableAt: timestamp,
      leaseToken: null,
      leaseUntil: null,
      receipt: null,
      lastError: null,
      suppressionReason: null,
    };
    intents.set(intent.id, intent);
    byDedupeKey.set(dedupeKey, intent.id);
    return { created: true, intent: { ...intent } };
  };

  const eligible = (intent: DeliveryIntent, timestamp: number) => {
    if (intent.status === "PENDING") return intent.availableAt <= timestamp;
    if (intent.status === "FAILED")
      return (
        intent.availableAt <= timestamp && intent.attempts < intent.maxAttempts
      );
    if (intent.status === "DISPATCHING")
      return intent.leaseUntil !== null && intent.leaseUntil <= timestamp;
    return false;
  };

  const leaseNextDeliveryIntents = (
    leaseOptions: { limit?: number; channel?: DeliveryChannel } = {},
  ) => {
    const limit = leaseOptions.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("Lease limit is invalid.");
    const timestamp = now();
    const leased: DeliveryIntent[] = [];
    for (const intent of [...intents.values()].sort(
      (left, right) =>
        left.availableAt - right.availableAt ||
        left.createdAt - right.createdAt ||
        left.id.localeCompare(right.id),
    )) {
      if (leased.length >= limit) break;
      if (leaseOptions.channel && intent.channel !== leaseOptions.channel)
        continue;
      if (!eligible(intent, timestamp)) continue;
      if (isChannelPaused(intent.channel)) continue;
      intent.status = "DISPATCHING";
      intent.attempts += 1;
      intent.leaseToken = idFactory();
      intent.leaseUntil = timestamp + leaseTtlMs;
      intent.updatedAt = timestamp;
      intent.lastError = null;
      leased.push({ ...intent });
    }
    return leased;
  };

  const requireIntent = (intentId: string) => {
    if (typeof intentId !== "string" || !intentId.trim()) return null;
    return intents.get(intentId) ?? null;
  };

  const markDelivered = (
    intentId: string,
    receipt: { reference: string } | string,
    transitionOptions: { leaseToken?: string } = {},
  ): DeliveryTransitionResult => {
    const intent = requireIntent(intentId);
    if (!intent) return { ok: false, reason: "unknown_intent", intent: null };
    if (intent.status !== "DISPATCHING")
      return { ok: false, reason: "not_dispatching", intent: { ...intent } };
    if (
      transitionOptions.leaseToken &&
      transitionOptions.leaseToken !== intent.leaseToken
    )
      return { ok: false, reason: "stale_lease", intent: { ...intent } };
    const reference =
      typeof receipt === "string" ? receipt : (receipt?.reference ?? "");
    if (!reference || reference.length > 500)
      return { ok: false, reason: "invalid_receipt", intent: { ...intent } };
    intent.status = "DELIVERED";
    intent.receipt = reference;
    intent.leaseToken = null;
    intent.leaseUntil = null;
    intent.updatedAt = now();
    noteChannelSuccess(intent.channel);
    return { ok: true, reason: "delivered", intent: { ...intent } };
  };

  const markFailed = (
    intentId: string,
    error: unknown,
    transitionOptions: { leaseToken?: string; retryable?: boolean } = {},
  ): DeliveryTransitionResult => {
    const intent = requireIntent(intentId);
    if (!intent) return { ok: false, reason: "unknown_intent", intent: null };
    if (intent.status !== "DISPATCHING")
      return { ok: false, reason: "not_dispatching", intent: { ...intent } };
    if (
      transitionOptions.leaseToken &&
      transitionOptions.leaseToken !== intent.leaseToken
    )
      return { ok: false, reason: "stale_lease", intent: { ...intent } };
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    intent.lastError = message.slice(0, 500);
    intent.leaseToken = null;
    intent.leaseUntil = null;
    intent.updatedAt = now();
    if (transitionOptions.retryable === false) {
      intent.status = "DEAD_LETTER";
      noteChannelFailure(intent.channel);
      return { ok: true, reason: "dead_letter", intent: { ...intent } };
    }
    if (intent.attempts >= intent.maxAttempts) {
      intent.status = "DEAD_LETTER";
      noteChannelFailure(intent.channel);
      return { ok: true, reason: "dead_letter", intent: { ...intent } };
    }
    intent.status = "FAILED";
    intent.availableAt =
      now() + backoffDelayMs(intent.attempts, backoffSchedule);
    noteChannelFailure(intent.channel);
    return { ok: true, reason: "retry_scheduled", intent: { ...intent } };
  };

  const markSuppressed = (
    intentId: string,
    reason: string,
  ): DeliveryTransitionResult => {
    const intent = requireIntent(intentId);
    if (!intent) return { ok: false, reason: "unknown_intent", intent: null };
    if (intent.status === "DELIVERED" || intent.status === "DEAD_LETTER")
      return { ok: false, reason: "terminal_state", intent: { ...intent } };
    intent.status = "SUPPRESSED";
    intent.suppressionReason = String(reason ?? "unspecified").slice(0, 500);
    intent.leaseToken = null;
    intent.leaseUntil = null;
    intent.updatedAt = now();
    return { ok: true, reason: "suppressed", intent: { ...intent } };
  };

  const get = (intentId: string) => {
    const intent = requireIntent(intentId);
    return intent ? { ...intent } : null;
  };

  return {
    enqueueDeliveryIntent,
    leaseNextDeliveryIntents,
    markDelivered,
    markFailed,
    markSuppressed,
    isChannelPaused,
    get,
    list: () => [...intents.values()].map((intent) => ({ ...intent })),
    size: () => intents.size,
  };
}

export type DeliveryIntentQueue = ReturnType<typeof createDeliveryIntentQueue>;

let defaultQueue: DeliveryIntentQueue | null = null;

/** Process-wide queue used by the module-level helpers. */
export function deliveryIntentQueue() {
  defaultQueue ??= createDeliveryIntentQueue();
  return defaultQueue;
}

export function enqueueDeliveryIntent(
  input: unknown,
  options: { maxAttempts?: number } = {},
) {
  return deliveryIntentQueue().enqueueDeliveryIntent(input, options);
}

export function leaseNextDeliveryIntents(
  options: { limit?: number; channel?: DeliveryChannel } = {},
) {
  return deliveryIntentQueue().leaseNextDeliveryIntents(options);
}

export function markDelivered(
  intentId: string,
  receipt: { reference: string } | string,
  options: { leaseToken?: string } = {},
) {
  return deliveryIntentQueue().markDelivered(intentId, receipt, options);
}

export function markFailed(
  intentId: string,
  error: unknown,
  options: { leaseToken?: string; retryable?: boolean } = {},
) {
  return deliveryIntentQueue().markFailed(intentId, error, options);
}

export function markSuppressed(intentId: string, reason: string) {
  return deliveryIntentQueue().markSuppressed(intentId, reason);
}

export function isChannelPaused(channel: DeliveryChannel) {
  return deliveryIntentQueue().isChannelPaused(channel);
}

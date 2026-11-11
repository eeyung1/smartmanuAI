import type { ProviderRequest, Transport } from "./adapters";
import type { DeliveryIntent } from "./intent-queue";

export type DispatchReceiptStatus =
  "accepted" | "retry" | "failed" | "suppressed";

export type DispatchReceipt = {
  status: DispatchReceiptStatus;
  intentId: string;
  channel: "email" | "telegram";
  externalReference: string | null;
  timestamp: string;
  code: string | null;
  retryAfterSeconds: number | null;
};

export type DispatchPayload = {
  subject?: string;
  title: string;
  body: string;
  /** Absolute https landing page for RFC 8058 one-click unsubscribe. */
  unsubscribeUrl?: string | null;
  unsubscribePostUrl?: string | null;
};

export type DispatchOptions = {
  timeoutMs?: number;
  payload?: DispatchPayload | null;
  /** Resolves the stored payload for an intent payload reference. */
  resolvePayload?: (
    payloadRef: string,
  ) => DispatchPayload | null | Promise<DispatchPayload | null>;
  telegramBotToken?: string | null;
  telegramApiBase?: string;
  now?: () => Date;
  /** Channel circuit breaker check; a paused channel is never dispatched. */
  isChannelPaused?: (channel: "email" | "telegram") => boolean;
  defaultRetryAfterSeconds?: number;
};

const MAX_TEXT_LENGTH = 4_000;

function text(value: unknown, limit = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  return value.slice(0, limit);
}

function retryAfterSeconds(
  headers: Record<string, string> | undefined,
  fallback: number,
) {
  const value = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (typeof value !== "string") return fallback;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(Math.floor(seconds), 86_400);
  const date = Date.parse(value);
  if (Number.isFinite(date))
    return Math.max(0, Math.floor((date - Date.now()) / 1000));
  return fallback;
}

function externalReference(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  for (const key of ["message_id", "id", "messageId"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  const result = record.result;
  if (result && typeof result === "object") return externalReference(result);
  return null;
}

function emailRequest(
  intent: DeliveryIntent,
  payload: DispatchPayload,
): ProviderRequest {
  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
  };
  const subject = text(payload.subject ?? payload.title, 200);
  if (subject) headers.Subject = subject;
  // RFC 8058 headers are only emitted for absolute https endpoints.
  const landing = text(payload.unsubscribeUrl ?? "", 2_000);
  if (/^https:\/\/[^\s]+$/i.test(landing)) {
    headers["List-Unsubscribe"] = `<${landing}>`;
    const post = text(payload.unsubscribePostUrl ?? "", 2_000);
    if (/^https:\/\/[^\s]+$/i.test(post))
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return {
    url: "https://mail.smartmanu.example/deliver",
    headers,
    body: [payload.title, payload.body].filter(Boolean).join("\n\n"),
  };
}

function telegramRequest(
  intent: DeliveryIntent,
  payload: DispatchPayload,
  options: DispatchOptions,
): ProviderRequest | null {
  const token = text(options.telegramBotToken ?? "", 200);
  if (!token) return null;
  const base = (options.telegramApiBase ?? "https://api.telegram.org").replace(
    /\/+$/,
    "",
  );
  return {
    url: `${base}/bot${token}/sendMessage`,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: intent.recipient,
      text: [payload.title, payload.body]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 4_096),
      disable_web_page_preview: true,
      allow_paid_broadcast: false,
    }),
  };
}

/**
 * Binds one leased delivery intent to a transport request and normalizes the
 * provider response into a receipt. It never throws for network or provider
 * failures, so a failed dispatch can be retried by the queue.
 */
export async function dispatchDeliveryIntent(
  intent: DeliveryIntent,
  transport: Transport,
  options: DispatchOptions = {},
): Promise<DispatchReceipt> {
  const now = options.now ?? (() => new Date());
  const timestamp = now().toISOString();
  const base = {
    intentId: intent?.id ?? "",
    channel: (intent?.channel ?? "email") as "email" | "telegram",
    externalReference: null as string | null,
    timestamp,
    code: null as string | null,
    retryAfterSeconds: null as number | null,
  };
  if (!intent || typeof intent.id !== "string" || !intent.id)
    return { ...base, status: "failed", code: "invalid_intent" };
  if (intent.status !== "DISPATCHING")
    return { ...base, status: "failed", code: "not_leased" };
  if (options.isChannelPaused?.(intent.channel))
    return { ...base, status: "suppressed", code: "channel_paused" };
  let payload = options.payload ?? null;
  if (!payload && options.resolvePayload)
    payload = await options.resolvePayload(intent.payloadRef);
  if (
    !payload ||
    typeof payload.title !== "string" ||
    typeof payload.body !== "string"
  )
    return { ...base, status: "failed", code: "payload_unavailable" };

  const request =
    intent.channel === "email"
      ? emailRequest(intent, payload)
      : telegramRequest(intent, payload, options);
  if (!request) return { ...base, status: "failed", code: "missing_bot_token" };

  const timeoutMs = options.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(request, controller.signal);
    const status = Number(response?.status ?? 0);
    if (status === 429)
      return {
        ...base,
        status: "retry",
        code: "rate_limited",
        retryAfterSeconds: retryAfterSeconds(
          response.headers,
          options.defaultRetryAfterSeconds ?? 60,
        ),
      };
    if (status >= 500)
      return {
        ...base,
        status: "retry",
        code: "provider_error",
        retryAfterSeconds: retryAfterSeconds(
          response.headers,
          options.defaultRetryAfterSeconds ?? 60,
        ),
      };
    if (status >= 400)
      return { ...base, status: "failed", code: "provider_rejected" };
    if (status >= 200 && status < 300)
      return {
        ...base,
        status: "accepted",
        externalReference: externalReference(response.body),
      };
    return { ...base, status: "failed", code: "unexpected_status" };
  } catch (error) {
    if (controller.signal.aborted)
      return {
        ...base,
        status: "retry",
        code: "timeout",
        retryAfterSeconds: options.defaultRetryAfterSeconds ?? 60,
      };
    return {
      ...base,
      status: "retry",
      code: "network_error",
      retryAfterSeconds: options.defaultRetryAfterSeconds ?? 60,
    };
  } finally {
    clearTimeout(timer);
  }
}

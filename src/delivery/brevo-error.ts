export type BrevoFailureReason =
  | "ip_authorization_required"
  | "api_authentication_rejected"
  | "sender_configuration_rejected"
  | "quota_exhausted"
  | "rate_limited"
  | "provider_unavailable"
  | "invalid_success_response"
  | "request_rejected"
  | "account_activation_required"
  | "request_format_rejected";

/** Inspect untrusted provider text, but expose only fixed diagnostic categories. */
export class BrevoDeliveryError extends Error {
  readonly status: number;
  readonly reason: BrevoFailureReason;
  constructor(status: number, body: unknown) {
    const safeStatus =
      Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
    const record =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const message =
      typeof record.message === "string"
        ? record.message.slice(0, 2000).toLowerCase()
        : "";
    const code = typeof record.code === "string" ? record.code : "";
    let reason: BrevoFailureReason = "request_rejected";
    if (safeStatus >= 200 && safeStatus < 300)
      reason = "invalid_success_response";
    else if (
      (safeStatus === 401 || safeStatus === 403) &&
      /(?:unrecogni[sz]ed|unauthori[sz]ed|unknown|whitelist|allowlist|authori[sz]e).{0,80}\bip\b|\bip\b.{0,80}(?:authori[sz]|block|whitelist|allowlist)/.test(
        message,
      )
    )
      reason = "ip_authorization_required";
    else if (safeStatus === 401 || safeStatus === 403)
      reason = "api_authentication_rejected";
    else if (
      /account.{0,80}(?:not activat|not validat|suspend)|(?:activat|validat).{0,80}account/.test(
        message,
      )
    )
      reason = "account_activation_required";
    else if (/sender|sending domain|from address/.test(message))
      reason = "sender_configuration_rejected";
    else if (code === "not_enough_credits") reason = "quota_exhausted";
    else if (safeStatus === 429) reason = "rate_limited";
    else if (safeStatus >= 500) reason = "provider_unavailable";
    else if (
      safeStatus === 400 &&
      /htmlcontent|textcontent|templateid|headers|json/.test(message)
    )
      reason = "request_format_rejected";
    super(`Brevo sign-in email failed: HTTP ${safeStatus}; ${reason}.`);
    this.name = "BrevoDeliveryError";
    this.status = safeStatus;
    this.reason = reason;
  }
}

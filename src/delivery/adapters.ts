import { z } from "zod";
export type ProviderRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};
export type Transport = (
  request: ProviderRequest,
  signal: AbortSignal,
) => Promise<{
  status: number;
  headers: Record<string, string>;
  body: unknown;
}>;
export type Outcome =
  | { state: "accepted"; id: string }
  | { state: "retry"; delaySeconds: number; code: string }
  | { state: "failed" | "uncertain"; code: string };
export type SimulationAdapter = {
  mode: "simulation";
  send: (request: ProviderRequest) => Promise<Outcome>;
};
export const itemSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(200),
  funding: z.string().max(50),
  deadline: z.string().nullable(),
  applicationFee: z.string().nullable(),
  certificateFee: z.string().nullable(),
  synthetic: z.literal(true),
});
export const simulationPayloadSchema = z.object({
  mode: z.literal("local_sink"),
  items: z.array(itemSchema).min(1).max(10),
  translationFallback: z.boolean(),
  unsubscribe: z
    .object({
      landingPath: z.string(),
      postPath: z.string(),
      postBody: z.literal("List-Unsubscribe=One-Click"),
    })
    .nullable(),
});
export type SimulationPayload = z.infer<typeof simulationPayloadSchema>;
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const short = (v: string | null, max = 35) =>
  v === null
    ? "Not stated"
    : Array.from(v).slice(0, max).join("") +
      (Array.from(v).length > max ? "…" : "");
export function buildSimulationRequest(
  channel: "email" | "telegram",
  recipient: string,
  payload: SimulationPayload,
  key: string,
): ProviderRequest {
  const origin = "https://smartmanu.example.test";
  const text = [
    "SYNTHETIC DELIVERY TEST — not an application opportunity.",
    payload.translationFallback
      ? "English fallback; selected translation unavailable."
      : "English digest.",
    "Eligibility needs checking. Open details for complete costs.",
    ...payload.items.map(
      (item) =>
        `${short(item.title, 80)}\n${item.funding.replaceAll("_", " ")} · Deadline: ${short(item.deadline, 20)}\nApplication fee: ${short(item.applicationFee)}; certificate: ${short(item.certificateFee)}\n${origin}/opportunities/${encodeURIComponent(item.id)}`,
    ),
  ].join("\n\n");
  if (channel === "telegram") {
    if (
      !/^[1-9]\d{0,15}$/.test(recipient) ||
      !Number.isSafeInteger(Number(recipient))
    )
      throw Error("Invalid simulation chat.");
    if (text.length > 4096)
      throw Error("Telegram simulation exceeds message limit.");
    return {
      url: "https://api.telegram.org/botLOCAL_SIMULATION_TOKEN/sendMessage",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: recipient,
        text,
        link_preview_options: { is_disabled: true },
        allow_paid_broadcast: false,
      }),
    };
  }
  if (
    !z.email().safeParse(recipient).success ||
    !recipient.toLowerCase().endsWith(".test")
  )
    throw Error("Simulation recipients must use .test email addresses.");
  if (
    !payload.unsubscribe ||
    !/^\/api\/notifications\/unsubscribe\?token=[A-Za-z0-9_.-]+$/.test(
      payload.unsubscribe.postPath,
    ) ||
    !/^\/unsubscribe\?token=[A-Za-z0-9_.-]+$/.test(
      payload.unsubscribe.landingPath,
    )
  )
    throw Error("Signed local unsubscribe paths are required.");
  return {
    url: "https://api.resend.com/emails",
    headers: {
      Authorization: "Bearer LOCAL_SIMULATION_KEY",
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      from: "smartmanuAI test <alerts@smartmanu.example.test>",
      to: [recipient],
      subject: "smartmanuAI synthetic digest test",
      text:
        text + "\n\nUnsubscribe: " + origin + payload.unsubscribe.landingPath,
      html:
        "<pre>" +
        escape(text) +
        '</pre><p><a href="' +
        escape(origin + payload.unsubscribe.landingPath) +
        '">Pause email digests</a></p>',
      headers: {
        "List-Unsubscribe": "<" + origin + payload.unsubscribe.postPath + ">",
        "List-Unsubscribe-Post": payload.unsubscribe.postBody,
      },
    }),
  };
}
export function simulationAdapter(
  channel: "email" | "telegram",
  transport: Transport,
): SimulationAdapter {
  return {
    mode: "simulation",
    send: async (request) => {
      try {
        const signal = AbortSignal.timeout(15000);
        const response = await Promise.race([
          transport(request, signal),
          new Promise<never>((_, reject) =>
            signal.addEventListener("abort", () => reject(Error("timeout")), {
              once: true,
            }),
          ),
        ]);
        if (response.status === 429) {
          const body = response.body as {
            parameters?: { retry_after?: unknown };
          };
          const rawWait = Object.entries(response.headers).find(
            ([key]) => key.toLowerCase() === "retry-after",
          )?.[1];
          const wait =
            channel === "telegram"
              ? Number(body?.parameters?.retry_after)
              : rawWait && /^\d+$/.test(rawWait)
                ? Number(rawWait)
                : rawWait
                  ? Math.ceil((Date.parse(rawWait) - Date.now()) / 1000)
                  : NaN;
          if (Number.isFinite(wait) && wait > 86400)
            return { state: "failed", code: "retry_delay_requires_review" };
          return {
            state: "retry",
            delaySeconds:
              Number.isFinite(wait) && wait >= 0
                ? Math.max(60, Math.min(86400, Math.ceil(wait)))
                : 60,
            code: "rate_limited",
          };
        }
        if (
          channel === "email" &&
          response.status === 409 &&
          (response.body as { name?: string })?.name ===
            "concurrent_idempotent_requests"
        )
          return {
            state: "retry",
            delaySeconds: 60,
            code: "concurrent_request",
          };
        if (response.status >= 500)
          return { state: "uncertain", code: "provider_server_error" };
        if (response.status >= 200 && response.status < 300) {
          const data = response.body as {
            id?: unknown;
            ok?: boolean;
            result?: { message_id?: unknown };
          };
          if (
            channel === "email" &&
            typeof data.id === "string" &&
            data.id.length > 0 &&
            data.id.length <= 200
          )
            return { state: "accepted", id: data.id };
          if (
            channel === "telegram" &&
            data.ok === true &&
            Number.isSafeInteger(data.result?.message_id) &&
            Number(data.result?.message_id) > 0
          )
            return { state: "accepted", id: String(data.result!.message_id) };
          return { state: "uncertain", code: "invalid_success_response" };
        }
        if (response.status >= 400 && response.status < 500)
          return {
            state: "failed",
            code:
              channel === "telegram" && response.status === 403
                ? "telegram_forbidden"
                : "provider_rejected",
          };
        return { state: "uncertain", code: "unexpected_response" };
      } catch {
        return { state: "uncertain", code: "transport_unknown" };
      }
    },
  };
}

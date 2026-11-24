import { z } from "zod";
import type { ProviderRequest, Transport } from "./adapters";

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";
export type BrevoConfig = {
  apiKey: string;
  sender: { name: string; email: string };
};

/** Read server-only settings without including credential values in errors. */
export function brevoConfig(
  env: Record<string, string | undefined> = process.env,
): BrevoConfig {
  const apiKey = env.BREVO_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim() ?? "";
  const match = /^([^<>\r\n]+)\s*<([^<>\r\n]+)>$/.exec(from);
  const email = (match?.[2] ?? from).trim();
  if (!apiKey || /[\r\n]/.test(apiKey))
    throw Error("BREVO_API_KEY is missing or invalid.");
  if (!z.email().safeParse(email).success)
    throw Error("EMAIL_FROM must be an email or Name <email>.");
  return {
    apiKey,
    sender: { name: match?.[1].trim() || "smartmanuAI", email },
  };
}

function emailHtml(text: string) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  return (
    "<!doctype html><html><body>" +
    text
      .split("\n")
      .map((line) => {
        const safe = escape(line);
        return /^https:\/\/[^\s]+$/.test(line)
          ? `<p><a href="${safe}">${safe}</a></p>`
          : `<p>${safe || "<br>"}</p>`;
      })
      .join("") +
    "</body></html>"
  );
}

export function buildBrevoRequest(
  config: BrevoConfig,
  message: {
    to: string;
    subject: string;
    text: string;
    headers?: Record<string, string>;
  },
): ProviderRequest {
  if (!z.email().safeParse(message.to).success)
    throw Error("Invalid email recipient.");
  if (!message.subject.trim() || /[\r\n]/.test(message.subject))
    throw Error("Invalid email subject.");
  const headers: Record<string, string> = {};
  for (const name of ["List-Unsubscribe", "List-Unsubscribe-Post"]) {
    const value = message.headers?.[name];
    if (value && !/[\r\n]/.test(value)) headers[name] = value;
  }
  const correlation = message.headers?.["X-Mailin-custom"];
  if (correlation && /^smartmanuai-alert:[a-f0-9-]{36}$/.test(correlation))
    headers["X-Mailin-custom"] = correlation;
  return {
    url: ENDPOINT,
    headers: {
      "api-key": config.apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: config.sender,
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: emailHtml(message.text),
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  };
}

/** A single attempt only: callers must reconcile ambiguous sends before retrying. */
export function brevoTransport(fetcher: typeof fetch = fetch): Transport {
  return async (request, signal) => {
    if (request.url !== ENDPOINT) throw Error("Invalid Brevo endpoint.");
    const response = await fetcher(ENDPOINT, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal,
      redirect: "error",
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* Dispatcher classifies missing receipts. */
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body,
    };
  };
}

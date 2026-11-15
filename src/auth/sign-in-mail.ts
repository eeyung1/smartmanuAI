import { createHash } from "node:crypto";
import type { SQL } from "../db";
import {
  brevoConfig,
  buildBrevoRequest,
  brevoTransport,
} from "../delivery/brevo";
import type { Transport } from "../delivery/adapters";
import { BrevoDeliveryError } from "../delivery/brevo-error";

/** Reserve before attempting delivery; all outcomes count against the daily limit. */
export async function reserveSignInMail(sql: SQL, email: string) {
  await sql.transaction(async (tx) => {
    const recipient = createHash("sha256")
      .update(email.toLowerCase())
      .digest("hex");
    for (const [bucket, limit] of [
      ["global", 20],
      [recipient, 5],
    ] as const) {
      const result = await tx.query(
        `INSERT INTO auth_mail_quota(bucket,day,attempts) VALUES($1,(NOW() AT TIME ZONE 'UTC')::date,1)
         ON CONFLICT(bucket,day) DO UPDATE SET attempts=auth_mail_quota.attempts+1
         WHERE auth_mail_quota.attempts < $2 RETURNING attempts`,
        [bucket, limit],
      );
      if (!result.rows.length)
        throw Error("Sign-in email limit reached. Try again tomorrow.");
    }
  });
}

export async function sendPilotSignInMail(input: {
  sql: SQL;
  email: string;
  url: string;
  baseURL: string;
  pilotEmails: string[];
  env?: Record<string, string | undefined>;
  transport?: Transport;
}) {
  if (!input.pilotEmails.includes(input.email.toLowerCase()))
    throw Error("Sign-in is limited to invited pilot accounts.");
  const link = new URL(input.url);
  if (
    link.origin !== input.baseURL ||
    link.pathname !== "/api/auth/magic-link/verify"
  )
    throw Error("Invalid sign-in link.");
  if (
    (
      await input.sql.query("SELECT privacy_pending_email($1) AS pending", [
        input.email,
      ])
    ).rows[0]?.pending
  )
    return;
  const token = link.searchParams.get("token");
  if (!token) throw Error("Invalid sign-in link.");
  const identifier =
    "magic-link:" + createHash("sha256").update(token).digest("base64url");
  if (
    !(
      await input.sql.query(
        "SELECT id FROM auth_verification WHERE identifier=$1 AND expires_at > NOW()",
        [identifier],
      )
    ).rows.length
  )
    throw Error("Sign-in link is no longer valid.");
  const config = brevoConfig(input.env);
  await reserveSignInMail(input.sql, input.email);
  const response = await (input.transport ?? brevoTransport())(
    buildBrevoRequest(config, {
      to: input.email,
      subject: "Your smartmanuAI sign-in link",
      text: `Sign in to smartmanuAI:\n\n${link.href}\n\nThis link expires in 10 minutes. If you did not request it, ignore this email.`,
    }),
    AbortSignal.timeout(15_000),
  );
  // Never retry an ambiguous send or expose the provider response/token in an error.
  if (
    response.status < 200 ||
    response.status >= 300 ||
    typeof (response.body as { messageId?: unknown } | null)?.messageId !==
      "string" ||
    !(response.body as { messageId: string }).messageId.trim()
  )
    throw new BrevoDeliveryError(response.status, response.body);
}

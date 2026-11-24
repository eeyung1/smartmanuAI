import { createHash, timingSafeEqual } from "node:crypto";
import { CatalogueError } from "../catalogue/service";
import { emailControlsConfig } from "../channels/email-controls";
import { brevoConfig } from "../delivery/brevo";
import { z } from "zod";
export const LIVE_EMAIL_CONSENT = "brevo-email-v1";
export function brevoCallbackConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.SMARTMANU_MODE !== "production" ||
    !/^[a-f0-9]{64}$/i.test(env.BREVO_WEBHOOK_SECRET ?? "")
  )
    throw new CatalogueError(503, "Live email is unavailable.");
  return {
    webhookSecret: env.BREVO_WEBHOOK_SECRET!,
    controls: emailControlsConfig(env),
  };
}
export function liveEmailConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const callback = brevoCallbackConfig(env);
  let origin: URL;
  try {
    origin = new URL(env.BETTER_AUTH_URL ?? "");
  } catch {
    throw new CatalogueError(503, "Live email is unavailable.");
  }
  if (
    env.SMARTMANU_EMAIL_ALERTS_ENABLED !== "1" ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.href !== origin.origin + "/" ||
    !/^[a-f0-9]{64}$/i.test(env.CRON_SECRET ?? "") ||
    !z.email().safeParse(env.SMARTMANU_OPERATOR_EMAIL).success
  )
    throw new CatalogueError(503, "Live email is unavailable.");
  return {
    ...callback,
    origin: origin.origin,
    cronSecret: env.CRON_SECRET!,
    operator: env.SMARTMANU_OPERATOR_EMAIL!.toLowerCase(),
    brevo: brevoConfig(env),
    configurationHash: createHash("sha256")
      .update(origin.origin + ":" + callback.webhookSecret)
      .digest("hex"),
  };
}
export type LiveEmailConfig = ReturnType<typeof liveEmailConfig>;
export function requireBearer(headers: Headers, secret: string) {
  const actual = headers.get("authorization") ?? "",
    expected = "Bearer " + secret;
  if (
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    throw new CatalogueError(401, "Invalid email webhook authentication.");
}

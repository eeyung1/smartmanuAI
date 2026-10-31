import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { nextCookies } from "better-auth/next-js";
import { appendLocalMail } from "./local-mail";
import { createHash } from "node:crypto";

import { getDatabase } from "../db";
import { localConfig } from "../config";
import * as schema from "../db/schema";
export async function createLocalAuth(
  database: Awaited<ReturnType<typeof getDatabase>>,
  dataDir: string,
) {
  const config = localConfig();
  return betterAuth({
    database: drizzleAdapter(database.orm, { provider: "pg", schema }),
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [config.baseURL],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (
              (
                await database.sql.query(
                  "SELECT id FROM account_deletion_requests WHERE user_id=$1 AND state='queued'",
                  [session.userId],
                )
              ).rows.length
            )
              return false;
          },
        },
      },
      verification: {
        create: {
          before: async (verification) => {
            let email: unknown;
            try {
              email = JSON.parse(verification.value).email;
            } catch {
              return;
            }
            if (
              typeof email === "string" &&
              (
                await database.sql.query(
                  "SELECT privacy_pending_email($1) AS pending",
                  [email],
                )
              ).rows[0].pending
            )
              return false;
          },
        },
      },
    },
    rateLimit: { enabled: true, window: 60, max: 20 },
    plugins: [
      magicLink({
        expiresIn: 600,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          if (!email.endsWith(".test"))
            throw new Error("Use a synthetic .test email in this local spike.");
          await appendLocalMail(dataDir, { to: email, url }, async () => {
            if (
              (
                await database.sql.query(
                  "SELECT privacy_pending_email($1) AS pending",
                  [email],
                )
              ).rows[0].pending
            )
              return false;
            const token = new URL(url).searchParams.get("token") ?? "",
              identifier =
                "magic-link:" +
                createHash("sha256").update(token).digest("base64url");
            return (
              (
                await database.sql.query(
                  "SELECT id FROM auth_verification WHERE identifier=$1",
                  [identifier],
                )
              ).rows.length > 0
            );
          });
        },
      }),
      nextCookies(),
    ],
  });
}
let auth: ReturnType<typeof createLocalAuth> | undefined;
export function getAuth() {
  return (auth ??= (async () =>
    createLocalAuth(await getDatabase(), localConfig().dataDir))());
}

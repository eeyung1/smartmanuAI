import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { nextCookies } from "better-auth/next-js";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
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
    rateLimit: { enabled: true, window: 60, max: 20 },
    plugins: [
      magicLink({
        expiresIn: 600,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          if (!email.endsWith(".test"))
            throw new Error("Use a synthetic .test email in this local spike.");
          await mkdir(dataDir, { recursive: true, mode: 0o700 });
          await appendFile(
            resolve(dataDir, "mail.jsonl"),
            JSON.stringify({ to: email, url }) + "\n",
            { mode: 0o600 },
          );
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

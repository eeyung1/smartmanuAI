import { randomBytes } from "node:crypto";
import { writeFile, readFile, appendFile } from "node:fs/promises";
const values = {
  SMARTMANU_MODE: "local",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  EVE_SPIKE_PASSWORD: randomBytes(32).toString("hex"),
  SMARTMANU_TELEGRAM_MODE: "local",
  TELEGRAM_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
  TELEGRAM_LINK_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
};
try {
  await writeFile(
    ".env.local",
    Object.entries(values)
      .map(([k, v]) => k + "=" + v)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created private local configuration. No live providers enabled.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  const existing = await readFile(".env.local", "utf8");
  const missing = Object.entries(values).filter(
    ([key]) => !new RegExp("^" + key + "=", "m").test(existing),
  );
  if (missing.length)
    await appendFile(
      ".env.local",
      "\n" + missing.map(([k, v]) => k + "=" + v).join("\n") + "\n",
    );
  console.log(
    "Preserved existing configuration and added missing local-only settings.",
  );
}

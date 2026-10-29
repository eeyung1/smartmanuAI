import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const value = `SMARTMANU_MODE=local\nBETTER_AUTH_URL=http://127.0.0.1:3000\nBETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\nEVE_SPIKE_PASSWORD=${randomBytes(32).toString("hex")}\n`;
try {
  await writeFile(".env.local", value, { flag: "wx", mode: 0o600 });
  console.log(
    "Created private local configuration. No live providers are enabled.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Kept existing .env.local unchanged.");
}

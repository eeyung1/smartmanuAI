import {
  mkdir,
  readFile,
  appendFile,
  writeFile,
  rename,
  rmdir,
  rm,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
export async function withLocalMailLock<T>(
  dataDir: string,
  fn: () => Promise<T>,
) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lock = resolve(dataDir, "mail.lock");
  let acquired = false;
  for (let i = 0; i < 100; i++) {
    try {
      await mkdir(lock, { mode: 0o700 });
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  if (!acquired) throw Error("Local mail sink is busy.");
  try {
    return await fn();
  } finally {
    await rmdir(lock);
  }
}
export async function appendLocalMail(
  dataDir: string,
  mail: { to: string; url: string },
  allowed: () => Promise<boolean>,
) {
  await withLocalMailLock(dataDir, async () => {
    if (await allowed())
      await appendFile(
        resolve(dataDir, "mail.jsonl"),
        JSON.stringify(mail) + "\n",
        { mode: 0o600 },
      );
  });
}
export async function purgeLocalMail(dataDir: string, email: string) {
  await withLocalMailLock(dataDir, async () => {
    const path = resolve(dataDir, "mail.jsonl");
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const remaining = text.split("\n").filter((line) => {
      if (!line) return false;
      const parsed = JSON.parse(line);
      if (typeof parsed.to !== "string")
        throw Error("Invalid local mail record.");
      return parsed.to.toLowerCase() !== email.toLowerCase();
    });
    const temp = join(dataDir, "mail-" + randomUUID() + ".tmp");
    try {
      await writeFile(
        temp,
        remaining.length ? remaining.join("\n") + "\n" : "",
        { mode: 0o600 },
      );
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true });
    }
  });
}

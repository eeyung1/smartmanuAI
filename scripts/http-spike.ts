import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { localConfig } from "../src/config";
localConfig();
const dir = await mkdtemp(join(tmpdir(), "smartmanu-http-"));
const log = await open(join(dir, "server.log"), "w");
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ],
  {
    env: { ...process.env, SMARTMANU_DATA_DIR: dir, DATABASE_URL: "" },
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
  },
);
const base = "http://127.0.0.1:3000";
async function login(email: string) {
  const sent = await fetch(base + "/api/auth/sign-in/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email, callbackURL: "/matches" }),
  });
  assert.equal(sent.status, 200);
  const mails = (await readFile(join(dir, "mail.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  const link = mails.findLast((m) => m.to === email).url;
  const response = await fetch(link, { redirect: "manual" });
  assert.equal(response.status, 302);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) throw new Error("Web server exited");
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, "Web server did not become ready");
  assert.match(await (await fetch(base)).text(), /Synthetic training provider/);
  assert.equal((await fetch(base + "/api/me/profile")).status, 401);
  const a = await login("http-alice@example.test");
  const b = await login("http-bob@example.test");
  assert.match(
    await (await fetch(base + "/matches", { headers: { Cookie: a } })).text(),
    /http-alice@example.test/,
  );
  const preferences = {
    interfaceLanguage: "en",
    alertLanguage: "zh-Hans",
    teachingLanguages: ["en"],
    nationality: "NG",
  };
  const saved = await fetch(base + "/api/me/profile", {
    method: "PATCH",
    headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), preferences);
  assert.equal(
    await (
      await fetch(base + "/api/me/profile", { headers: { Cookie: b } })
    ).json(),
    null,
  );
  const forged = await fetch(base + "/api/me/profile", {
    method: "PATCH",
    headers: { Cookie: b, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ ...preferences, userId: "someone-else" }),
  });
  assert.equal(forged.status, 400);
  const denied = await fetch(base + "/api/me/profile", {
    method: "PATCH",
    headers: {
      Cookie: a,
      Origin: "https://invalid.example.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferences),
  });
  assert.equal(denied.status, 403);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await fetch(base + "/api/me/saved", {
          method: "POST",
          headers: {
            Cookie: a,
            Origin: base,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ opportunityId: "synthetic-course" }),
        })
      ).status,
      200,
    );
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/saved", { headers: { Cookie: a } })
      ).json()
    ).length,
    1,
  );
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/saved", { headers: { Cookie: b } })
      ).json()
    ).length,
    0,
  );
  const logout = await fetch(base + "/api/auth/sign-out", {
    method: "POST",
    headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(logout.status, 200);
  assert.equal(
    (await fetch(base + "/api/me/profile", { headers: { Cookie: a } })).status,
    401,
  );
  console.log(
    "PASS: web HTML, magic-link cookies, private API isolation, profile persistence, saved-item deduplication, origin rejection and sign-out",
  );
} catch (error) {
  console.error(await readFile(join(dir, "server.log"), "utf8"));
  throw error;
} finally {
  if (server.exitCode === null && server.pid) {
    const exited = once(server, "exit");
    process.kill(-server.pid, "SIGTERM");
    await exited;
  }
  await log.close();
  await rm(dir, { recursive: true, force: true });
}

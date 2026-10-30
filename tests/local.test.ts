import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { openDatabase } from "../src/db";
import { createLocalAuth } from "../src/auth";
import {
  saveProfile,
  readProfile,
  saveItem,
  listSaved,
} from "../src/domain/profile";
import {
  reserveBudget,
  queueNotification,
  dispatchOne,
} from "../src/jobs/local";
import { parseExtraction } from "../src/research/fixture";
import { localConfig } from "../src/config";
process.env.SMARTMANU_MODE = "local";
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
async function login(
  auth: Awaited<ReturnType<typeof createLocalAuth>>,
  dir: string,
  email: string,
) {
  const result = await auth.handler(
    new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:3000",
      },
      body: JSON.stringify({ email, callbackURL: "/matches" }),
    }),
  );
  assert.equal(result.status, 200);
  const mails = (await readFile(join(dir, "mail.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  const url = mails.findLast((m) => m.to === email).url;
  const verified = await auth.handler(new Request(url));
  assert.equal(verified.status, 302);
  const cookie = verified.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  assert.ok(session);
  return { userId: session.user.id, url, cookie };
}
test("real magic links isolate two users; replay and forged ownership rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-auth-"));
  const db = await openDatabase(dir);
  try {
    await seedLocalCatalogue(db.sql);
    const auth = await createLocalAuth(db, dir);
    const a = await login(auth, dir, "alice@example.test");
    const b = await login(auth, dir, "bob@example.test");
    await saveProfile(db.sql, a.userId, {
      alertLanguage: "zh-Hans",
      interfaceLanguage: "en",
      teachingLanguages: ["en"],
      nationality: "NG",
    });
    assert.equal(await readProfile(db.sql, b.userId), null);
    await assert.rejects(() =>
      saveProfile(db.sql, b.userId, { userId: a.userId, alertLanguage: "en" }),
    );
    await saveItem(db.sql, a.userId, "synthetic-course");
    await saveItem(db.sql, a.userId, "synthetic-course");
    assert.equal((await listSaved(db.sql, a.userId)).length, 1);
    assert.equal((await listSaved(db.sql, b.userId)).length, 0);
    assert.equal(await auth.api.getSession({ headers: new Headers() }), null);
    const replay = await auth.handler(new Request(a.url));
    assert.ok(
      !replay.headers
        .getSetCookie()
        .some((c) => c.startsWith("better-auth.session_token=")),
    );
    const denied = await auth.handler(
      new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://attacker.example.test",
        },
        body: JSON.stringify({ email: "mallory@example.test" }),
      }),
    );
    assert.equal(denied.status, 403);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("budget reservation is atomic under concurrent requests and rejects invalid values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-budget-"));
  const db = await openDatabase(dir);
  try {
    const result = await Promise.all([
      reserveBudget(db.sql, 2000000),
      reserveBudget(db.sql, 2000000),
    ]);
    assert.equal(result.filter(Boolean).length, 1);
    await assert.rejects(() => reserveBudget(db.sql, -1));
    assert.equal(
      Number(
        (await db.sql.query("SELECT reserved_micros FROM budget")).rows[0]
          .reserved_micros,
      ),
      2000000,
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("outbox survives process restart, suppresses opt-out and deduplicates sink delivery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-jobs-"));
  let db = await openDatabase(dir);
  try {
    await db.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('fixture-user','Fixture','worker@example.test',NOW(),NOW())",
    );
    await db.sql.query(
      "INSERT INTO notification_preferences(user_id,enabled) VALUES('fixture-user',true)",
    );
    await queueNotification(db.sql, "fixture-user", "one");
    await queueNotification(db.sql, "fixture-user", "one");
    await db.close();
    for (let i = 0; i < 2; i++) {
      const child = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/worker-once.ts"],
        {
          env: { ...process.env, SMARTMANU_DATA_DIR: dir, DATABASE_URL: "" },
          encoding: "utf8",
          timeout: 30000,
        },
      );
      assert.equal(child.status, 0, child.stderr);
    }
    db = await openDatabase(dir);
    assert.equal(
      (await db.sql.query("SELECT * FROM sink_messages")).rows.length,
      1,
    );
    await queueNotification(db.sql, "fixture-user", "two");
    await db.sql.query(
      "UPDATE notification_preferences SET enabled=false WHERE user_id='fixture-user'",
    );
    assert.equal(await dispatchOne(db.sql), "suppressed");
    assert.equal(
      (await db.sql.query("SELECT * FROM sink_messages")).rows.length,
      1,
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("structured extraction cannot claim zero certificate fees or skip review", () => {
  assert.throws(() =>
    parseExtraction(
      '{"title":"Smart Manufacturing Basics","funding":"free_participation","certificateFee":0,"reviewRequired":false}',
    ),
  );
});
test("local guard refuses public origins, remote databases, missing secret and non-local mode", () => {
  const base = {
    SMARTMANU_MODE: "local",
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
    BETTER_AUTH_SECRET: "a".repeat(64),
  };
  assert.throws(() =>
    localConfig({ ...base, BETTER_AUTH_URL: "https://example.com" }),
  );
  assert.throws(() =>
    localConfig({ ...base, DATABASE_URL: "postgresql://example.com/test" }),
  );
  assert.throws(() => localConfig({ ...base, SMARTMANU_MODE: "production" }));
  assert.throws(() => localConfig({ ...base, BETTER_AUTH_SECRET: "" }));
});

test("notification event deduplication is scoped to each user", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-event-"));
  const db = await openDatabase(dir);
  try {
    for (const id of ["one", "two"]) {
      await db.sql.query(
        "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
        [id, id + "@example.test"],
      );
      await db.sql.query(
        "INSERT INTO notification_preferences(user_id,enabled) VALUES($1,true)",
        [id],
      );
      await queueNotification(db.sql, id, "same-event");
    }
    await dispatchOne(db.sql);
    await dispatchOne(db.sql);
    assert.equal(
      (await db.sql.query("SELECT * FROM sink_messages")).rows.length,
      2,
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("expired magic links cannot establish a session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-expired-"));
  const db = await openDatabase(dir);
  try {
    const auth = await createLocalAuth(db, dir);
    const r = await auth.handler(
      new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:3000",
        },
        body: JSON.stringify({
          email: "expired@example.test",
          callbackURL: "/matches",
        }),
      }),
    );
    assert.equal(r.status, 200);
    const link = JSON.parse(
      (await readFile(join(dir, "mail.jsonl"), "utf8")).trim(),
    ).url;
    await db.sql.query(
      "UPDATE auth_verification SET expires_at=NOW()-INTERVAL '1 hour'",
    );
    const verified = await auth.handler(new Request(link));
    assert.ok(
      !verified.headers
        .getSetCookie()
        .some((c) => c.startsWith("better-auth.session_token=")),
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

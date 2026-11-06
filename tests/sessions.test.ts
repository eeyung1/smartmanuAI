import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { createLocalAuth } from "../src/auth";
import {
  listAccountSessions,
  revokeAccountSession,
  sessionQuerySchema,
} from "../src/auth/sessions";
import { POST } from "../app/api/me/sessions/route";
process.env.SMARTMANU_MODE = "local";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID();
test("session controls reject unsafe origins and invalid pagination", async () => {
  assert.equal(
    (
      await POST(
        new Request("http://127.0.0.1:3000/api/me/sessions", {
          method: "POST",
          headers: { origin: "https://attacker.test" },
          body: "{}",
        }),
      )
    ).status,
    403,
  );
  for (const input of [
    { page: 0 },
    { page: [1, 2] },
    { page: 1.5 },
    { userId: "other" },
  ])
    assert.equal(sessionQuerySchema.safeParse(input).success, false);
});
async function login(
  auth: Awaited<ReturnType<typeof createLocalAuth>>,
  dir: string,
  email: string,
) {
  const response = await auth.handler(
    new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
      },
      body: JSON.stringify({ email, callbackURL: "/account/sessions" }),
    }),
  );
  assert.equal(response.status, 200);
  const mail = (await readFile(join(dir, "mail.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .findLast((value) => value.to === email);
  const verified = await auth.handler(
    new Request(mail.url, {
      headers: { "user-agent": "Synthetic session browser" },
    }),
  );
  assert.equal(verified.status, 302);
  const headers = new Headers({
    cookie: verified.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
  });
  const session = await auth.api.getSession({ headers });
  assert.ok(session);
  return {
    headers,
    actor: { userId: session.user.id, sessionId: session.session.id },
  };
}
for (const kind of ["pglite", "postgres"].filter(
  (kind) =>
    !process.env.SMARTMANU_SESSION_TEST_KIND ||
    kind === process.env.SMARTMANU_SESSION_TEST_KIND,
))
  test(
    `${kind}: session inventory is private and paginated; revocation invalidates real authentication cookies`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      // Better Auth's in-memory authentication quotas are process-global.
      // Each database scenario represents a separate deployment, so isolate its quota state.
      if (kind === "postgres" && !process.env.SMARTMANU_SESSION_TEST_KIND) {
        await promisify(execFile)(
          process.execPath,
          ["--import", "tsx", "--test", "tests/sessions.test.ts"],
          {
            env: { ...process.env, SMARTMANU_SESSION_TEST_KIND: "postgres" },
            timeout: 60000,
          },
        );
        return;
      }
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-sessions-")),
        schema = "sessions_" + randomUUID().replaceAll("-", "");
      let pool: Pool | undefined, url: string | undefined;
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await pool.query(`CREATE SCHEMA "${schema}"`);
        const parsed = new URL(process.env.TEST_DATABASE_URL!);
        parsed.searchParams.set("options", `-c search_path=${schema}`);
        url = parsed.href;
      }
      const db = await openDatabase(dir, url);
      try {
        const auth = await createLocalAuth(db, dir);
        const a = await login(auth, dir, "sessions-a@example.test"),
          a2 = await login(auth, dir, "sessions-a@example.test"),
          b = await login(auth, dir, "sessions-b@example.test");
        for (let i = 0; i < 42; i++)
          await db.sql.query(
            "INSERT INTO auth_session(id,user_id,token,created_at,updated_at,expires_at) VALUES($1,$2,$3,NOW(),NOW(),NOW()+INTERVAL '1 day')",
            [`extra-${i}`, a.actor.userId, `synthetic-token-${i}`],
          );
        await db.sql.query(
          "INSERT INTO auth_session(id,user_id,token,created_at,updated_at,expires_at) VALUES('expired',$1,'expired-token',NOW(),NOW(),NOW()-INTERVAL '1 day')",
          [a.actor.userId],
        );
        const pages = await Promise.all(
          [1, 2, 3].map((page) =>
            listAccountSessions(db.sql, a.actor, { page }),
          ),
        );
        assert.equal(pages[0].total, 44);
        assert.equal(pages[0].items.length, 20);
        assert.equal(pages[2].items.length, 4);
        const items = pages.flatMap((page) => page.items);
        assert.equal(new Set(items.map((item) => item.id)).size, 44);
        assert.equal(items.filter((item) => item.current).length, 1);
        assert.ok(
          !items.some(
            (item) => item.id === b.actor.sessionId || item.id === "expired",
          ),
        );
        assert.doesNotMatch(
          JSON.stringify(pages),
          /"token"|"ip_address"|synthetic-token|expired-token/,
        );
        for (const path of [
          "list-sessions",
          "revoke-session",
          "revoke-sessions",
          "revoke-other-sessions",
        ]) {
          assert.equal(
            (
              await auth.handler(
                new Request("http://127.0.0.1:3000/api/auth/" + path, {
                  method: path === "list-sessions" ? "GET" : "POST",
                  headers: a.headers,
                }),
              )
            ).status,
            404,
          );
        }
        assert.equal(
          (
            await revokeAccountSession(db.sql, a.actor, {
              sessionId: b.actor.sessionId,
            })
          ).revoked,
          false,
        );
        assert.ok(await auth.api.getSession({ headers: b.headers }));
        await assert.rejects(
          revokeAccountSession(db.sql, a.actor, {
            sessionId: a2.actor.sessionId,
            userId: b.actor.userId,
          }),
        );
        const results = await Promise.all([
          revokeAccountSession(db.sql, a.actor, {
            sessionId: a2.actor.sessionId,
          }),
          revokeAccountSession(db.sql, a.actor, {
            sessionId: a2.actor.sessionId,
          }),
        ]);
        assert.equal(results.filter((value) => value.revoked).length, 1);
        assert.equal(await auth.api.getSession({ headers: a2.headers }), null);
        assert.ok(await auth.api.getSession({ headers: a.headers }));
        await db.sql.query(
          "UPDATE auth_session SET created_at=NOW()-INTERVAL '11 minutes' WHERE id=$1",
          [a.actor.sessionId],
        );
        await assert.rejects(
          listAccountSessions(db.sql, a.actor),
          /Sign in again/,
        );
        await assert.rejects(
          revokeAccountSession(db.sql, a.actor, { sessionId: "extra-1" }),
          /Sign in again/,
        );
        await db.sql.query(
          "UPDATE auth_session SET created_at=NOW() WHERE id=$1",
          [a.actor.sessionId],
        );
        assert.deepEqual(
          await revokeAccountSession(db.sql, a.actor, {
            sessionId: a.actor.sessionId,
          }),
          { revoked: true, currentSessionRevoked: true },
        );
        assert.equal(await auth.api.getSession({ headers: a.headers }), null);
        await assert.rejects(
          listAccountSessions(db.sql, a.actor),
          /Sign in required/,
        );
        assert.ok(await auth.api.getSession({ headers: b.headers }));
      } finally {
        await db.close();
        await rm(dir, { recursive: true, force: true });
        if (pool) {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        }
      }
    },
  );

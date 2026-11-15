import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { X509Certificate } from "node:crypto";
import { getTableConfig } from "drizzle-orm/pg-core";
import { openDatabase } from "../src/db";
import { authSchema } from "../src/db/schema";
import { createLocalAuth } from "../src/auth";
import { reserveSignInMail } from "../src/auth/sign-in-mail";
import { localConfig } from "../src/config";
import { stagingSchemaSQL } from "../scripts/lib/staging-schema";
import { productionRoleSQL } from "../scripts/lib/production-role";

const origin = "https://pilot.vercel.app";
const email = "invited@example.com";
const local = {
  SMARTMANU_MODE: "local",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  BETTER_AUTH_SECRET: "fixture-secret-at-least-thirty-two-characters",
};
const pilotConfig = {
  ...localConfig(local),
  mode: "production" as const,
  baseURL: origin,
  pilotEmails: [email],
};

test("hosted auth tables carry an explicit schema independent of pool search_path", () => {
  for (const table of Object.values(authSchema("isolated_app")))
    assert.equal(getTableConfig(table).schema, "isolated_app");
});
test("production configuration requires scoped writer, CA, provider and pilot allowlist", async () => {
  const bootstrap = await readFile("docs/vercel-supabase-staging.md", "utf8");
  assert.ok(bootstrap.includes("smartmanuai"));
  // Extract a public CA fixture from the installed trust store, never production secrets.
  const { rootCertificates } = await import("node:tls");
  const ca = rootCertificates.find((pem) => new X509Certificate(pem).ca)!;
  const env = {
    ...local,
    SMARTMANU_MODE: "production",
    BETTER_AUTH_URL: origin,
    SMARTMANU_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    SMARTMANU_APP_DATABASE_URL:
      "postgresql://smartmanuai_app.abcdefghijklmnopqrst:fixture@aws-1-eu-west-1.pooler.supabase.com:6543/postgres",
    SMARTMANU_DATABASE_CA_CERT: ca,
    BREVO_API_KEY: "fixture",
    EMAIL_FROM: "sender@example.com",
    SMARTMANU_PILOT_EMAILS: email,
  };
  assert.equal(localConfig(env).mode, "production");
  for (const change of [
    { SMARTMANU_DATABASE_CA_CERT: "" },
    { SMARTMANU_PILOT_EMAILS: "" },
    { BREVO_API_KEY: "" },
    {
      SMARTMANU_APP_DATABASE_URL: env.SMARTMANU_APP_DATABASE_URL.replace(
        "smartmanuai_app",
        "smartmanuai_owner",
      ),
    },
    { SMARTMANU_EMAIL_MODE: "local" },
    { SMARTMANU_ENABLE_COLLECTION: "1" },
  ])
    assert.throws(() => localConfig({ ...env, ...change }));
});

for (const kind of ["pglite", "postgres"] as const)
  test(
    `${kind}: pilot sign-in uses Brevo, secure single-use tokens and a scoped database`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-pilot-"));
      const operator = await openDatabase(
        dir,
        kind === "postgres" ? process.env.TEST_DATABASE_URL : undefined,
      );
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
      const schema = "pilot_" + suffix,
        owner = "owner_" + suffix,
        reader = "reader_" + suffix,
        app = "app_" + suffix;
      let runtime = operator;
      const previous = { ...process.env };
      try {
        if (kind === "postgres") {
          const username = String(
            (await operator.sql.query("SELECT current_user AS name")).rows[0]
              .name,
          );
          await operator.sql.transaction(async (tx) => {
            await tx.exec(
              await stagingSchemaSQL({
                schema,
                owner,
                reader,
                operator: username,
              }),
            );
            await tx.exec(productionRoleSQL(schema, app));
          });
          const password = randomBytes(24).toString("hex");
          await operator.sql.exec(
            `ALTER ROLE "${app}" LOGIN PASSWORD '${password}'`,
          );
          const url = new URL(process.env.TEST_DATABASE_URL!);
          url.username = app;
          url.password = password;
          runtime = await openDatabase(dir, url.href, {
            schema,
            migrate: false,
          });
          await assert.rejects(
            runtime.sql.exec(
              `CREATE TABLE "${schema}".must_not_create(id text)`,
            ),
          );
          await assert.rejects(
            runtime.sql.exec("SELECT * FROM public.auth_user"),
          );
          await assert.rejects(
            runtime.sql.exec(
              "INSERT INTO admin_roles(user_id) VALUES('no-access')",
            ),
          );
        }
        process.env.BREVO_API_KEY = "fixture-only";
        process.env.EMAIL_FROM = "smartmanuAI <sender@example.com>";
        const messages: string[] = [];
        const auth = await createLocalAuth(runtime, dir, {
          config: pilotConfig,
          mailTransport: async (request) => {
            messages.push(JSON.parse(request.body).textContent);
            return {
              status: 201,
              headers: {},
              body: { messageId: "fixture-id" },
            };
          },
        });
        const request = (address: string) =>
          auth.handler(
            new Request(origin + "/api/auth/sign-in/magic-link", {
              method: "POST",
              headers: { "Content-Type": "application/json", Origin: origin },
              body: JSON.stringify({ email: address, callbackURL: "/matches" }),
            }),
          );
        await request("outsider@example.com");
        assert.equal(messages.length, 0);
        assert.equal(
          Number(
            (
              await runtime.sql.query(
                "SELECT COUNT(*) AS n FROM auth_verification",
              )
            ).rows[0].n,
          ),
          0,
        );
        assert.equal((await request(email)).status, 200);
        assert.equal(messages.length, 1);
        const link = messages[0].match(/https:\/\/[^\s]+/)![0];
        const token = new URL(link).searchParams.get("token")!;
        const stored = (
          await runtime.sql.query(
            "SELECT identifier,value FROM auth_verification",
          )
        ).rows;
        assert.ok(!JSON.stringify(stored).includes(token));
        const response = await auth.handler(new Request(link));
        assert.equal(response.status, 302);
        assert.ok(
          response.headers
            .getSetCookie()
            .some((cookie) => /; Secure/i.test(cookie)),
        );
        const cookie = response.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; ");
        const session = await auth.api.getSession({
          headers: new Headers({ cookie }),
        });
        assert.equal(session?.user.email, email);
        const replay = await auth.handler(new Request(link));
        assert.ok(
          !replay.headers
            .getSetCookie()
            .some((value) => value.includes("session_token=")),
        );
        await assert.rejects(access(join(dir, "mail.jsonl")));
        for (let i = 1; i < 5; i++) await reserveSignInMail(runtime.sql, email);
        await assert.rejects(reserveSignInMail(runtime.sql, email), /limit/);
        assert.equal(
          Number(
            (
              await runtime.sql.query(
                "SELECT attempts FROM auth_mail_quota WHERE bucket='global'",
              )
            ).rows[0].attempts,
          ),
          5,
        );
      } finally {
        for (const key of Object.keys(process.env))
          if (!(key in previous)) delete process.env[key];
        Object.assign(process.env, previous);
        if (runtime !== operator) await runtime.close();
        if (kind === "postgres")
          await operator.sql.exec(
            `DROP SCHEMA IF EXISTS "${schema}" CASCADE; DROP ROLE IF EXISTS "${app}"; DROP ROLE IF EXISTS "${reader}"; DROP ROLE IF EXISTS "${owner}";`,
          );
        await operator.close();
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

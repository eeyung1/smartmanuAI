import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue, fixtureDetails } from "../src/catalogue/fixtures";
const execute = promisify(execFile);

test("notification commands run persisted local jobs once and refuse staging before database access", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-command-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SMARTMANU_MODE: "local",
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
    BETTER_AUTH_SECRET: "synthetic-test-secret-longer-than-32-characters",
    SMARTMANU_DATA_DIR: dir,
  };
  delete env.DATABASE_URL;
  const run = (script: string, overrides = {}) =>
    execute(
      process.execPath,
      ["--import", "tsx", `scripts/${script}-once.ts`],
      { env: { ...env, ...overrides }, timeout: 30000 },
    );
  try {
    for (const script of ["reminders", "changes"]) {
      await assert.rejects(
        run(script, {
          SMARTMANU_MODE: "staging",
          BETTER_AUTH_URL: "https://smartmanuai-test.vercel.app",
          SMARTMANU_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
          DATABASE_URL:
            "postgresql://smartmanuai_reader.abcdefghijklmnopqrst:synthetic@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
          SMARTMANU_EMAIL_MODE: "",
          SMARTMANU_TELEGRAM_MODE: "",
          SMARTMANU_DELIVERY_MODE: "",
          SMARTMANU_ENABLE_COLLECTION: "0",
          SMARTMANU_ENABLE_PAID_RESEARCH: "0",
        }),
        /require local mode/,
      );
    }
    assert.deepEqual(
      await readdir(dir),
      [],
      "staging must not create local storage",
    );
    let db = await openDatabase(dir);
    try {
      await seedLocalCatalogue(db.sql);
      const deadline = new Date(Date.now() + 7 * 86400000)
        .toISOString()
        .slice(0, 10);
      const previous = { ...fixtureDetails, deadline: "2099-12-31" };
      const current = { ...fixtureDetails, deadline };
      await db.sql.query(
        "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('command-user','Command user','command@example.test',NOW(),NOW())",
      );
      await db.sql.query(
        "INSERT INTO notification_preferences(user_id,enabled,deadline_reminders_enabled,channel,consent_version) VALUES('command-user',true,true,'telegram','local-sink-v1')",
      );
      await db.sql.query(
        "INSERT INTO saved_items(user_id,opportunity_id,status,saved) VALUES('command-user','synthetic-course','applying',true)",
      );
      await db.sql.query(
        "UPDATE opportunity_revisions SET details=$1 WHERE opportunity_id='synthetic-course'",
        [JSON.stringify(previous)],
      );
      await db.sql.query(
        "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES('synthetic-course',3,'published',$1,'{}','local-fixture-reviewer','Move deadline earlier')",
        [JSON.stringify(current)],
      );
      await db.sql.query(
        "UPDATE opportunities SET revision=3,details=$1,verified_at=NOW() WHERE id='synthetic-course'",
        [JSON.stringify(current)],
      );
    } finally {
      await db.close();
    }
    for (const script of ["reminders", "changes"]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const output = JSON.parse((await run(script)).stdout);
        assert.equal(output.externalDelivery, false);
        assert.equal(output.deliveryMode, "local_sink");
        assert.equal(
          script === "reminders" ? output.result.sent : output.result.queued,
          attempt === 0 ? 1 : 0,
        );
      }
    }
    db = await openDatabase(dir);
    try {
      assert.equal(
        (
          await db.sql.query(
            "SELECT event_key FROM sink_messages WHERE payload->>'type'='deadline_reminder'",
          )
        ).rows.length,
        1,
      );
      assert.equal(
        (
          await db.sql.query(
            "SELECT id FROM outbox WHERE user_id='command-user' AND state='queued'",
          )
        ).rows.length,
        1,
      );
    } finally {
      await db.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

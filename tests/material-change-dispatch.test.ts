import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue, fixtureDetails } from "../src/catalogue/fixtures";
import { detectMaterialChangeAlerts } from "../src/jobs/material-changes";
import { dispatchOne, queueNotification } from "../src/jobs/local";
import { emailControlsConfig, emailHash } from "../src/channels/email-controls";
process.env.SMARTMANU_EMAIL_MODE = "local";
process.env.NOTIFICATION_UNSUBSCRIBE_KEY = "a".repeat(64);
process.env.EMAIL_WEBHOOK_SIGNING_SECRET =
  "whsec_" + Buffer.alloc(32, 1).toString("base64");
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: material-change dispatch rechecks current owner state and accepts once`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "change-dispatch-")),
        schema = "changes_" + randomUUID().replaceAll("-", "");
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
        await seedLocalCatalogue(db.sql);
        const owner = "change-owner";
        await db.sql.query(
          "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,'change@example.test',NOW(),NOW())",
          [owner],
        );
        await db.sql.query(
          "INSERT INTO notification_preferences(user_id,enabled,channel,material_changes_enabled,consent_version) VALUES($1,true,'telegram',true,'local-sink-v1')",
          [owner],
        );
        await db.sql.query(
          "INSERT INTO saved_items(user_id,opportunity_id,status,saved) VALUES($1,'synthetic-course','applying',true)",
          [owner],
        );
        const revised = { ...fixtureDetails, funding: "unclear" };
        await db.sql.query(
          "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES('synthetic-course',3,'published',$1,'{}','local-fixture-reviewer','Funding withdrawal fixture')",
          [JSON.stringify(revised)],
        );
        await db.sql.query(
          "UPDATE opportunities SET revision=3,details=$1 WHERE id='synthetic-course'",
          [JSON.stringify(revised)],
        );
        assert.equal((await detectMaterialChangeAlerts(db.sql)).queued, 1);
        const row = (
          await db.sql.query(
            "SELECT id,event_key,payload FROM outbox WHERE user_id=$1",
            [owner],
          )
        ).rows[0];
        async function reset() {
          await db.sql.query(
            "UPDATE outbox SET state='queued',payload=$2 WHERE id=$1",
            [row.id, JSON.stringify(row.payload)],
          );
        }
        for (const status of ["applied", "interested"]) {
          await reset();
          await db.sql.query(
            "UPDATE saved_items SET status=$2,saved=$3 WHERE user_id=$1",
            [owner, status, status === "applied"],
          );
          assert.equal(
            await dispatchOne(db.sql, "material_change"),
            "suppressed",
          );
        }
        await db.sql.query(
          "UPDATE saved_items SET status='applying',saved=true WHERE user_id=$1",
          [owner],
        );
        await reset();
        await db.sql.query(
          "UPDATE opportunities SET revision=4 WHERE id='synthetic-course'",
        );
        assert.equal(
          await dispatchOne(db.sql, "material_change"),
          "suppressed",
        );
        await db.sql.query(
          "UPDATE opportunities SET revision=3 WHERE id='synthetic-course'",
        );
        await reset();
        await db.sql.query(
          "UPDATE opportunity_revisions SET created_at=NOW()-INTERVAL '25 hours' WHERE opportunity_id='synthetic-course' AND revision=3",
        );
        assert.equal(
          await dispatchOne(db.sql, "material_change"),
          "suppressed",
        );
        await db.sql.query(
          "UPDATE opportunity_revisions SET created_at=NOW() WHERE opportunity_id='synthetic-course' AND revision=3",
        );
        await reset();
        await db.sql.query(
          "UPDATE notification_preferences SET channel='email' WHERE user_id=$1",
          [owner],
        );
        await db.sql.query(
          "UPDATE outbox SET payload=jsonb_set(payload,'{channel}','\"email\"') WHERE id=$1",
          [row.id],
        );
        await db.sql.query(
          "INSERT INTO email_webhook_events(event_id,message_id,event_type,recipient_hashes) VALUES('dispatch-bounce','fixture-message','email.bounced','[]')",
        );
        await db.sql.query(
          "INSERT INTO email_suppressions(recipient_hash,reason,event_id) VALUES($1,'bounce','dispatch-bounce')",
          [emailHash("change@example.test", emailControlsConfig())],
        );
        assert.equal(
          await dispatchOne(db.sql, "material_change"),
          "suppressed",
        );
        await db.sql.query(
          "UPDATE notification_preferences SET channel='telegram' WHERE user_id=$1",
          [owner],
        );
        await reset();
        await queueNotification(db.sql, owner, "unrelated");
        const concurrent = await Promise.all([
          dispatchOne(db.sql, "material_change"),
          dispatchOne(db.sql, "material_change"),
        ]);
        assert.equal(
          concurrent.filter((value) => value === "accepted").length,
          1,
        );
        assert.equal(
          (
            await db.sql.query(
              "SELECT * FROM sink_messages WHERE event_key=$1",
              [row.event_key],
            )
          ).rows.length,
          1,
        );
        assert.equal(await dispatchOne(db.sql, "material_change"), "empty");
        assert.equal(
          (await db.sql.query("SELECT * FROM outbox WHERE state='queued'")).rows
            .length,
          1,
        );
      } finally {
        await db.close();
        if (pool) {
          await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          await pool.end();
        }
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

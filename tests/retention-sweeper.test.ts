import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import { executeRetentionSweep } from "../src/privacy/retention-sweeper";

const now = new Date("2026-11-10T00:00:00.000Z");

async function seed(db: Awaited<ReturnType<typeof openDatabase>>) {
  await db.sql.query(
    "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('operator','Operator','operator@example.test',NOW(),NOW()),('member','Member','member@example.test',NOW(),NOW())",
  );
  await db.sql.query("INSERT INTO admin_roles(user_id) VALUES('operator')");
  await db.sql.query(
    "INSERT INTO sources(id,name,url,created_by) VALUES('retention-source','Retention source','https://school.example.edu/retention','operator')",
  );
  await db.sql.query(
    "INSERT INTO source_snapshots(id,source_id,content_hash,content,fetched_at,last_seen_at) VALUES('old-snapshot','retention-source','old-hash','captured evidence',$1,$1),('drafted-snapshot','retention-source','drafted-hash','drafted evidence',$1,$1),('fresh-snapshot','retention-source','fresh-hash','fresh evidence',$2,$2)",
    [
      new Date(now.getTime() - 200 * 86_400_000).toISOString(),
      new Date(now.getTime() - 10 * 86_400_000).toISOString(),
    ],
  );
  await db.sql.query(
    "INSERT INTO research_candidates(id,snapshot_id,state) VALUES('old-rejected','old-snapshot','rejected'),('old-drafted','drafted-snapshot','drafted'),('fresh-pending','fresh-snapshot','pending')",
  );
  await db.sql.query(
    "INSERT INTO research_usage(id,candidate_id,reserved_micros,state,model) VALUES('old-usage','old-rejected',1000,'completed','fixture-model'),('fresh-usage','fresh-pending',1000,'reserved','fixture-model')",
  );
  await db.sql.query(
    "INSERT INTO source_http_validators(source_id,snapshot_id,url) VALUES('retention-source','old-snapshot','https://school.example.edu/retention')",
  );
  await db.sql.query(
    "INSERT INTO notification_digests(id,user_id,preference_version,channel,slot,state) VALUES('digest-old','member',1,'email','daily','accepted'),('digest-fresh','member',1,'email','weekly','accepted')",
  );
  await db.sql.query(
    "INSERT INTO delivery_simulations(id,user_id,digest_id,channel,preference_version,sealed_request,state,created_at) VALUES('delivery-old','member','digest-old','email',1,'sealed','accepted',$1),('delivery-fresh','member','digest-fresh','email',1,'sealed','accepted',$2)",
    [
      new Date(now.getTime() - 100 * 86_400_000).toISOString(),
      new Date(now.getTime() - 5 * 86_400_000).toISOString(),
    ],
  );
  await db.sql.query(
    "INSERT INTO email_digest_attempts(message_id,user_id,recipient_hash,created_at) VALUES('attempt-old','member','hash',$1),('attempt-fresh','member','hash',$2)",
    [
      new Date(now.getTime() - 100 * 86_400_000).toISOString(),
      new Date(now.getTime() - 5 * 86_400_000).toISOString(),
    ],
  );
  await db.sql.query(
    "INSERT INTO auth_session(id,expires_at,token,created_at,updated_at,user_id) VALUES('session-old',$1,'token-old',NOW(),NOW(),'member'),('session-fresh',$2,'token-fresh',NOW(),NOW(),'member')",
    [
      new Date(now.getTime() - 60 * 86_400_000).toISOString(),
      new Date(now.getTime() + 60 * 86_400_000).toISOString(),
    ],
  );
  await db.sql.query(
    "INSERT INTO auth_verification(id,identifier,value,expires_at,created_at,updated_at) VALUES('verification-old','old@example.test','value',$1,NOW(),NOW())",
    [new Date(now.getTime() - 60 * 86_400_000).toISOString()],
  );
  await db.sql.query(
    "INSERT INTO telegram_link_tokens(token_hash,user_id,issued_at,expires_at) VALUES('token-old','member',$1,$2)",
    [
      new Date(now.getTime() - 60 * 86_400_000).toISOString(),
      new Date(now.getTime() - 60 * 86_400_000).toISOString(),
    ],
  );
  await db.sql.query(
    "INSERT INTO notification_unsubscribe_tokens(nonce_hash,user_id,consent_epoch,expires_at) VALUES('nonce-old','member',1,$1)",
    [new Date(now.getTime() - 60 * 86_400_000).toISOString()],
  );
}

const counts = async (
  db: Awaited<ReturnType<typeof openDatabase>>,
  table: string,
  column: string,
) =>
  Number(
    (
      await db.sql.query(
        `SELECT COUNT(*)::text AS count FROM ${table} WHERE ${column}`,
      )
    ).rows[0].count,
  );

test("retention sweep purges expired operational records and keeps live evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-retention-"));
  const db = await openDatabase(dir);
  try {
    await seed(db);
    await assert.rejects(
      executeRetentionSweep(db.sql, { now }),
      /operator authority or a valid job key/,
    );
    await assert.rejects(
      executeRetentionSweep(db.sql, { operatorId: "member", now }),
      /Administrator/,
    );
    await assert.rejects(
      executeRetentionSweep(db.sql, {
        operatorId: "operator",
        now,
        windows: { deliveryLogsDays: 0 },
      }),
      /retention window is invalid/,
    );

    const preview = await executeRetentionSweep(db.sql, {
      operatorId: "operator",
      now,
      dryRun: true,
    });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.authorizedAs, "operator");
    assert.ok(preview.durationMs >= 0);
    assert.equal(preview.candidates.delivery_simulations, 1);
    assert.equal(preview.deleted.delivery_simulations, undefined);
    assert.equal(
      await counts(db, "delivery_simulations", "id='delivery-old'"),
      1,
      "a dry run must not mutate records",
    );

    const report = await executeRetentionSweep(db.sql, {
      operatorId: "operator",
      now,
    });
    assert.equal(report.dryRun, false);
    assert.equal(report.deleted.delivery_simulations, 1);
    assert.equal(report.deleted.email_digest_attempts, 1);
    assert.equal(report.deleted.auth_session, 1);
    assert.equal(report.deleted.auth_verification, 1);
    assert.equal(report.deleted.telegram_link_tokens, 1);
    assert.equal(report.deleted.notification_unsubscribe_tokens, 1);
    assert.equal(report.deleted.research_usage, 1);
    assert.equal(report.deleted.research_candidates, 1);
    assert.equal(report.deleted.source_http_validators, 1);
    assert.equal(report.deleted.source_snapshots, 1);
    assert.equal(
      await counts(db, "delivery_simulations", "id='delivery-fresh'"),
      1,
      "recent delivery logs are retained",
    );
    assert.equal(
      await counts(db, "research_candidates", "id='old-drafted'"),
      1,
      "drafted candidates keep their evidence",
    );
    assert.equal(
      await counts(db, "source_snapshots", "id='drafted-snapshot'"),
      1,
      "snapshots backing a drafted candidate are retained",
    );
    assert.equal(
      await counts(db, "source_snapshots", "id='old-snapshot'"),
      0,
      "snapshots that no longer back a candidate are purged",
    );
    assert.equal(
      await counts(db, "source_snapshots", "id='fresh-snapshot'"),
      1,
    );
    assert.equal(
      await counts(db, "research_usage", "id='fresh-usage'"),
      1,
      "live ledger reservations are retained",
    );
    assert.equal(
      await counts(db, "auth_session", "id='session-fresh'"),
      1,
      "active sessions are retained",
    );

    const repeated = await executeRetentionSweep(db.sql, {
      operatorId: "operator",
      now,
    });
    assert.equal(repeated.deleted.delivery_simulations, 0);
    assert.equal(repeated.deleted.research_candidates, 0);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("retention sweep accepts an authorized job key and audits the report", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-retention-job-"));
  const db = await openDatabase(dir);
  const audited: unknown[] = [];
  try {
    await seed(db);
    const report = await executeRetentionSweep(db.sql, {
      jobKey: "job-secret",
      expectedJobKey: "job-secret",
      now,
      audit: (value) => {
        audited.push(value);
      },
    });
    assert.equal(report.authorizedAs, "job");
    assert.equal(audited.length, 1);
    assert.equal(
      await counts(db, "delivery_simulations", "id='delivery-old'"),
      0,
    );
    await assert.rejects(
      executeRetentionSweep(db.sql, {
        jobKey: "wrong-secret",
        expectedJobKey: "job-secret",
        now,
      }),
      /valid job key/,
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

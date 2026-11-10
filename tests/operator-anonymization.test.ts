import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db";
import { fixtureDetails } from "../src/catalogue/fixtures";
import { requestAccountDeletion } from "../src/privacy/account";
import {
  anonymizedReviewerId,
  anonymizeReviewerContributions,
} from "../src/privacy/operator-anonymization";

test("administrator anonymization transactionally reassigns audit authorship and unblocks deletion", async () => {
  const dir = await mkdtemp(
    join(tmpdir(), "smartmanu-reviewer-anonymization-"),
  );
  const db = await openDatabase(dir);
  const operator = "privacy-operator",
    target = "reviewer-to-delete",
    outsider = "non-admin-operator";
  try {
    for (const id of [operator, target, outsider])
      await db.sql.query(
        "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
        [id, `${id}@example.test`],
      );
    await db.sql.query("INSERT INTO admin_roles(user_id) VALUES($1),($2)", [
      operator,
      target,
    ]);
    await db.sql.query(
      "INSERT INTO sources(id,name,url,created_by) VALUES('anon-source','Anonymization source','https://school.example.edu/privacy',$1)",
      [target],
    );
    await db.sql.query(
      `INSERT INTO opportunities(id,source_id,revision,state,details,evidence)
       VALUES('anon-opportunity','anon-source',1,'draft',$1,'{}')`,
      [JSON.stringify(fixtureDetails)],
    );
    await db.sql.query(
      `INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note)
       VALUES('anon-opportunity',1,'draft',$1,'{}',$2,'Original reviewed contribution')`,
      [JSON.stringify(fixtureDetails), target],
    );
    await db.sql.query(
      `INSERT INTO source_collection_policies(source_id,enabled,permission_note,actor_id)
       VALUES('anon-source',false,'Reviewed privacy fixture.',$1)`,
      [target],
    );
    await db.sql.query(
      "INSERT INTO research_jobs(id,source_id,state,attempts) VALUES('anon-job','anon-source','queued',0)",
    );
    await db.sql.query(
      `INSERT INTO research_job_actions(id,job_id,action,actor_id,note,previous_state,previous_attempts)
       VALUES('anon-action','anon-job','cancel',$1,'Cancelled for privacy fixture','queued',0)`,
      [target],
    );

    await assert.rejects(
      requestAccountDeletion(db.sql, target, { confirmation: "DELETE" }),
      /operator-assisted/,
    );
    await assert.rejects(
      anonymizeReviewerContributions(
        db.sql,
        outsider,
        target,
        "Remove reviewer identity for approved privacy request.",
      ),
      /Administrator/,
    );
    assert.equal(
      (
        await db.sql.query(
          "SELECT COUNT(*) AS count FROM sources WHERE created_by=$1",
          [target],
        )
      ).rows[0].count,
      1,
    );

    const pseudonym = anonymizedReviewerId(target);
    await db.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,'Collision','collision@example.test',NOW(),NOW())",
      [pseudonym],
    );
    await assert.rejects(
      anonymizeReviewerContributions(
        db.sql,
        operator,
        target,
        "Remove reviewer identity for approved privacy request.",
      ),
      /different metadata/,
    );
    assert.equal(
      (
        await db.sql.query(
          "SELECT COUNT(*) AS count FROM opportunity_revisions WHERE actor_id=$1",
          [target],
        )
      ).rows[0].count,
      1,
      "a collision rolls back every reassignment",
    );
    await db.sql.query("DELETE FROM auth_user WHERE id=$1", [pseudonym]);

    const result = await anonymizeReviewerContributions(
      db.sql,
      operator,
      target,
      "  Remove reviewer identity for approved privacy request.  ",
    );
    assert.equal(result.pseudonymId, pseudonym);
    assert.equal(result.alreadyRecorded, false);
    assert.deepEqual(result.reassigned, {
      sources: 1,
      revisions: 1,
      policies: 1,
      jobActions: 1,
    });
    assert.match(result.audit.targetReference, /^[a-f0-9]{64}$/);
    assert.match(result.audit.operatorReference, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(result.audit), new RegExp(target));
    assert.doesNotMatch(JSON.stringify(result.audit), new RegExp(operator));

    for (const [table, column] of [
      ["sources", "created_by"],
      ["opportunity_revisions", "actor_id"],
      ["source_collection_policies", "actor_id"],
      ["research_job_actions", "actor_id"],
    ] as const) {
      const row = (
        await db.sql.query(`SELECT ${column} AS actor FROM ${table} LIMIT 1`)
      ).rows[0];
      assert.equal(row.actor, pseudonym);
    }
    const auditUser = (
      await db.sql.query(
        "SELECT name,email,email_verified,image,created_at FROM auth_user WHERE id=$1",
        [pseudonym],
      )
    ).rows[0];
    assert.equal(auditUser.name, "Anonymized reviewer");
    assert.equal(auditUser.email, `${pseudonym}@redacted.invalid`);
    assert.equal(auditUser.email_verified, false);
    assert.deepEqual(JSON.parse(String(auditUser.image)), result.audit);

    const repeated = await anonymizeReviewerContributions(
      db.sql,
      operator,
      target,
      "Remove reviewer identity for approved privacy request.",
    );
    assert.equal(repeated.alreadyRecorded, true);
    assert.deepEqual(repeated.reassigned, {
      sources: 0,
      revisions: 0,
      policies: 0,
      jobActions: 0,
    });
    assert.equal(repeated.audit.anonymizedAt, result.audit.anonymizedAt);

    const deletion = await requestAccountDeletion(db.sql, target, {
      confirmation: "DELETE",
    });
    assert.equal(deletion.state, "queued");
    assert.equal(
      (
        await db.sql.query(
          "SELECT COUNT(*) AS count FROM account_deletion_requests WHERE user_id=$1",
          [target],
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await db.sql.query(
          "SELECT COUNT(*) AS count FROM auth_user WHERE id=$1",
          [pseudonym],
        )
      ).rows[0].count,
      1,
      "the audit pseudonym is independent of target-account deletion",
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("anonymization rejects missing accounts and weak justification without writing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-reviewer-invalid-"));
  const db = await openDatabase(dir);
  try {
    await db.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('operator','Operator','operator@example.test',NOW(),NOW())",
    );
    await db.sql.query("INSERT INTO admin_roles(user_id) VALUES('operator')");
    await assert.rejects(
      anonymizeReviewerContributions(
        db.sql,
        "operator",
        "missing",
        "too short",
      ),
      /justification/,
    );
    await assert.rejects(
      anonymizeReviewerContributions(
        db.sql,
        "operator",
        "missing",
        "Valid justification but account is absent.",
      ),
      /Account not found/,
    );
    assert.equal(
      (
        await db.sql.query(
          "SELECT COUNT(*) AS count FROM auth_user WHERE id LIKE 'anonymized-reviewer-%'",
        )
      ).rows[0].count,
      0,
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

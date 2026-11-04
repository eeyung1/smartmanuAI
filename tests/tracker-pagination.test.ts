import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { seedLocalCatalogue } from "../src/catalogue/fixtures";
import { openDatabase } from "../src/db";
import { listTrackerPage } from "../src/domain/tracker";

test("tracker pagination, status filters and literal search reach beyond 100 rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-tracker-pages-"));
  const database = await openDatabase(dir);
  try {
    await seedLocalCatalogue(database.sql);
    await database.sql.query(
      "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES('tracker-user','Tracker user','tracker@example.test',NOW(),NOW()),('other-user','Other user','other@example.test',NOW(),NOW())",
    );
    const source = (
      await database.sql.query(
        "SELECT source_id,details,evidence FROM opportunities WHERE id='synthetic-course'",
      )
    ).rows[0];
    for (let index = 1; index <= 125; index++) {
      const id = `tracker-${String(index).padStart(3, "0")}`;
      const title =
        index === 120 ? "Grant 120% special" : `Manufacturing grant ${index}`;
      const details = { ...(source.details as object), title };
      await database.sql.query(
        "INSERT INTO opportunities(id,source_id,revision,state,details,evidence,verified_at) VALUES($1,$2,1,'published',$3,$4,NOW())",
        [id, source.source_id, details, source.evidence],
      );
      await database.sql.query(
        "INSERT INTO opportunity_revisions(opportunity_id,revision,state,details,evidence,actor_id,note) VALUES($1,1,'published',$2,$3,'local-fixture-reviewer','pagination fixture')",
        [id, details, source.evidence],
      );
      await database.sql.query(
        "INSERT INTO saved_items(user_id,opportunity_id,status,saved,dismissed_fingerprint,updated_at) VALUES('tracker-user',$1,$2,true,$3,NOW()-($4*INTERVAL '1 minute'))",
        [
          id,
          ["interested", "applying", "applied"][index % 3],
          index % 10 === 0 ? "previous-fingerprint" : null,
          index,
        ],
      );
    }
    await database.sql.query(
      "INSERT INTO saved_items(user_id,opportunity_id,status,saved) VALUES('other-user','tracker-001','interested',true)",
    );

    const first = await listTrackerPage(database.sql, "tracker-user");
    assert.equal(first.total, 125);
    assert.equal(first.items.length, 12);
    assert.equal(first.items[0].opportunity_id, "tracker-001");

    const beyondCap = await listTrackerPage(database.sql, "tracker-user", {
      page: 11,
    });
    assert.equal(beyondCap.items.length, 5);
    assert.equal(beyondCap.items[0].opportunity_id, "tracker-121");

    const applied = await listTrackerPage(database.sql, "tracker-user", {
      status: "applied",
    });
    assert.equal(applied.total, 42);
    assert.ok(applied.items.every((item) => item.status === "applied"));

    const dismissed = await listTrackerPage(database.sql, "tracker-user", {
      status: "dismissed",
    });
    assert.equal(dismissed.total, 12);
    assert.ok(dismissed.items.every((item) => item.dismissed));

    const literalPercent = await listTrackerPage(database.sql, "tracker-user", {
      search: "120%",
    });
    assert.equal(literalPercent.total, 1);
    assert.equal(literalPercent.items[0].opportunity_id, "tracker-120");

    const otherUser = await listTrackerPage(database.sql, "other-user");
    assert.equal(otherUser.total, 1);
  } finally {
    await database.close();
    await rm(dir, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue, fixtureDetails } from "../src/catalogue/fixtures";
import { listPublic } from "../src/catalogue/service";
import { detailsSchema } from "../src/catalogue/schema";
import { saveProfile } from "../src/domain/profile";
import { personalBrowseNotes } from "../src/domain/browse-notes";
import { evaluateMatch } from "../src/domain/matching";
import { screenText, matchExplanation } from "../src/i18n/screens";
for (const kind of ["pglite", "postgres"])
  test(
    `${kind}: private browse notes explain visible mismatches without filtering or exposing another profile`,
    { skip: kind === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "smartmanu-browse-notes-")),
        schema = "browse_" + randomUUID().replaceAll("-", "");
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
        for (const user of ["browse-a", "browse-b", "no-profile"])
          await db.sql.query(
            "INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES($1,$1,$2,NOW(),NOW())",
            [user, user + "@example.test"],
          );
        const a = await saveProfile(db.sql, "browse-a", {
          categories: ["scholarship"],
          funding: ["tuition_only"],
          nationality: "NG",
          topics: ["robotics"],
        });
        await saveProfile(db.sql, "browse-b", {});
        const source = (
          await db.sql.query(
            "SELECT source_id FROM opportunities WHERE id='synthetic-course'",
          )
        ).rows[0].source_id;
        for (let n = 0; n < 26; n++)
          await db.sql.query(
            "INSERT INTO opportunities(id,source_id,revision,state,details,evidence,verified_at) VALUES($1,$2,1,'published',$3,'{}',NOW())",
            [
              "browse-" + String(n).padStart(2, "0"),
              source,
              JSON.stringify(fixtureDetails),
            ],
          );
        const publicBefore = await listPublic(db.sql, { page: 2 });
        const first = await personalBrowseNotes(
          db.sql,
          "browse-a",
          publicBefore.items,
        );
        assert.equal(publicBefore.items.length, 12);
        assert.equal(first.profileRequired, false);
        assert.equal(first.profileVersion, 1);
        assert.deepEqual(
          Object.keys(first.notes),
          publicBefore.items.map((item) => item.id),
        );
        for (const item of publicBefore.items) {
          const expected = evaluateMatch(a, item.details);
          assert.deepEqual(first.notes[item.id], {
            failures: expected.failures,
            unknowns: expected.unknowns,
          });
          assert.ok(
            first.notes[item.id].failures.includes(
              "Outside your funding preferences.",
            ),
          );
        }
        const other = await personalBrowseNotes(
          db.sql,
          "browse-b",
          publicBefore.items,
        );
        assert.ok(
          Object.values(other.notes).every(
            (note) => note.failures.length === 0 && note.unknowns.length > 0,
          ),
        );
        const absent = await personalBrowseNotes(
          db.sql,
          "no-profile",
          publicBefore.items,
        );
        assert.equal(absent.profileRequired, true);
        assert.equal(Object.keys(absent.notes).length, 0);
        assert.deepEqual(await listPublic(db.sql, { page: 2 }), publicBefore);
        assert.doesNotMatch(
          JSON.stringify(first),
          /"nationality"|"preferences"|"userId"|"score"|browse-b/,
        );
        await saveProfile(db.sql, "browse-a", {});
        const changed = await personalBrowseNotes(
          db.sql,
          "browse-a",
          publicBefore.items,
        );
        assert.equal(changed.profileVersion, 2);
        assert.ok(
          Object.values(changed.notes).every(
            (note) => note.failures.length === 0,
          ),
        );
        const restriction = detailsSchema.parse({
          ...fixtureDetails,
          eligibilityRules: {
            nationalities: ["CN"],
            residenceCountries: ["CN"],
            minAge: 30,
            maxAge: 40,
            minQualification: "master",
          },
        });
        await saveProfile(db.sql, "browse-a", {
          nationality: "NG",
          residenceCountry: "NG",
          birthYear: 2005,
          qualification: "bachelor",
        });
        const strict = await personalBrowseNotes(
          db.sql,
          "browse-a",
          [{ id: "restricted", details: restriction }],
          new Date("2026-11-06T12:00:00Z"),
        );
        assert.equal(strict.notes.restricted.failures.length, 4);
        for (const reason of [
          ...first.notes[publicBefore.items[0].id].failures,
          ...strict.notes.restricted.failures,
          ...strict.notes.restricted.unknowns,
        ])
          assert.notEqual(matchExplanation("zh-Hans", reason), reason);
        assert.notEqual(
          screenText(
            "zh-Hans",
            "No recorded mismatch; eligibility needs checking",
          ),
          "No recorded mismatch; eligibility needs checking",
        );
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

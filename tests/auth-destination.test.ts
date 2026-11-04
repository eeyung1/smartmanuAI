import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLocalAuth } from "../src/auth";
import {
  DEFAULT_AUTH_DESTINATION,
  safeAuthDestination,
} from "../src/auth/destination";
import { openDatabase } from "../src/db";

process.env.SMARTMANU_MODE = "local";
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";

test("authentication destinations keep safe relative paths only", () => {
  assert.equal(
    safeAuthDestination("/opportunities/synthetic-course?from=save#details"),
    "/opportunities/synthetic-course?from=save#details",
  );
  assert.equal(
    safeAuthDestination("/matches/../notifications"),
    "/notifications",
  );

  for (const unsafe of [
    undefined,
    "",
    "matches",
    "https://attacker.example/path",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "/opportunities/one\nLocation: https://attacker.example",
    "/" + "x".repeat(2_048),
  ])
    assert.equal(safeAuthDestination(unsafe), DEFAULT_AUTH_DESTINATION);
});

test("magic-link verification redirects to the preserved opportunity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-auth-destination-"));
  const database = await openDatabase(dir);
  try {
    const auth = await createLocalAuth(database, dir);
    const returnTo = safeAuthDestination(
      "/opportunities/synthetic-course?from=save",
    );
    const sent = await auth.handler(
      new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:3000",
        },
        body: JSON.stringify({
          email: "destination@example.test",
          callbackURL: returnTo,
        }),
      }),
    );
    assert.equal(sent.status, 200);

    const mail = JSON.parse(
      (await readFile(join(dir, "mail.jsonl"), "utf8")).trim(),
    ) as { to: string; url: string };
    assert.equal(mail.to, "destination@example.test");
    assert.equal(new URL(mail.url).searchParams.get("callbackURL"), returnTo);

    const verified = await auth.handler(new Request(mail.url));
    assert.equal(verified.status, 302);
    assert.equal(
      verified.headers.get("location"),
      "http://127.0.0.1:3000/opportunities/synthetic-course?from=save",
    );
  } finally {
    await database.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("the auth endpoint rejects an external callback URL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smartmanu-auth-external-"));
  const database = await openDatabase(dir);
  try {
    const auth = await createLocalAuth(database, dir);
    const response = await auth.handler(
      new Request("http://127.0.0.1:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:3000",
        },
        body: JSON.stringify({
          email: "external@example.test",
          callbackURL: "https://attacker.example/path",
        }),
      }),
    );
    assert.equal(response.status, 403);
    await assert.rejects(readFile(join(dir, "mail.jsonl"), "utf8"), {
      code: "ENOENT",
    });
  } finally {
    await database.close();
    await rm(dir, { recursive: true, force: true });
  }
});

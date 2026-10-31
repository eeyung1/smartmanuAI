import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { preferencesSchema } from "../src/domain/profile";
import { localConfig } from "../src/config";
import { openDatabase } from "../src/db";
import { seedLocalCatalogue } from "../src/catalogue/fixtures";
localConfig();
const dir = await mkdtemp(join(tmpdir(), "smartmanu-http-"));
const seed = await openDatabase(dir);
await seedLocalCatalogue(seed.sql);
await seed.close();
const log = await open(join(dir, "server.log"), "w");
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ],
  {
    env: { ...process.env, SMARTMANU_DATA_DIR: dir, DATABASE_URL: "" },
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
  },
);
const base = "http://127.0.0.1:3000";
async function login(email: string) {
  const sent = await fetch(base + "/api/auth/sign-in/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email, callbackURL: "/matches" }),
  });
  assert.equal(sent.status, 200);
  const mails = (await readFile(join(dir, "mail.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  const link = mails.findLast((m) => m.to === email).url;
  const response = await fetch(link, { redirect: "manual" });
  assert.equal(response.status, 302);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) throw new Error("Web server exited");
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, "Web server did not become ready");
  assert.match(await (await fetch(base)).text(), /Synthetic training provider/);
  assert.equal((await fetch(base + "/api/me/profile")).status, 401);
  const changeLocale = (body: unknown, origin = base) =>
    fetch(base + "/api/locale", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await changeLocale({ locale: "zh-Hans" }, "https://attacker.example.test"))
      .status,
    403,
  );
  assert.equal((await changeLocale({ locale: "fr" })).status, 400);
  assert.equal(
    (await changeLocale({ locale: "en", userId: "other" })).status,
    400,
  );
  const localeResponse = await changeLocale({ locale: "zh-Hans" });
  assert.equal(localeResponse.status, 200);
  assert.equal(localeResponse.headers.get("cache-control"), "no-store");
  const localeHeader = localeResponse.headers.getSetCookie()[0];
  assert.ok(localeHeader.includes("HttpOnly"));
  assert.ok(localeHeader.includes("SameSite=Lax"));
  const localeCookie = localeHeader.split(";")[0];
  const chineseSignIn = await (
    await fetch(base + "/sign-in", { headers: { Cookie: localeCookie } })
  ).text();
  assert.match(chineseSignIn, /<html lang="zh-Hans"/);
  assert.match(chineseSignIn, /欢迎回来/);
  assert.match(chineseSignIn, /其他页面和来源文字/);
  const englishSignIn = await (await fetch(base + "/sign-in")).text();
  assert.match(englishSignIn, /<html lang="en"/);
  assert.match(englishSignIn, /Welcome back/);
  const invalidCookie = await (
    await fetch(base + "/sign-in", {
      headers: { Cookie: "smartmanu_locale=invalid" },
    })
  ).text();
  assert.match(invalidCookie, /<html lang="en"/);
  const a = await login("http-alice@example.test");
  const b = await login("http-bob@example.test");
  const admin = await login("reviewer@example.test");
  assert.equal((await fetch(base + "/api/admin/research")).status, 401);
  assert.equal(
    (await fetch(base + "/api/admin/research", { headers: { Cookie: a } }))
      .status,
    403,
  );
  assert.equal(
    (await fetch(base + "/admin/research", { headers: { Cookie: admin } }))
      .status,
    200,
  );
  const research = await fetch(base + "/api/admin/research", {
    headers: { Cookie: admin },
  });
  assert.equal(research.status, 200);
  assert.ok((await research.json()).sources.length > 0);

  assert.equal(
    (await fetch(base + "/api/admin/opportunities", { headers: { Cookie: a } }))
      .status,
    403,
  );
  assert.equal(
    (await fetch(base + "/admin/review", { headers: { Cookie: admin } }))
      .status,
    200,
  );
  const post = (path: string, body: unknown, cookie = admin) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: base,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const sourceResponse = await post("/api/admin/sources", {
    name: "HTTP fixture source",
    url: "https://example.test/http-course",
    synthetic: true,
  });
  assert.equal(sourceResponse.status, 201);
  const source = await sourceResponse.json();
  assert.equal(
    (
      await post("/api/admin/research", {
        action: "policy",
        sourceId: source.id,
        enabled: true,
        permissionNote: "Synthetic collection must be refused.",
      })
    ).status,
    400,
  );
  const official = await post("/api/admin/sources", {
    name: "HTTP collection policy",
    url: "https://school.example.edu/manufacturing",
    synthetic: false,
  });
  assert.equal(official.status, 201);
  const officialSource = await official.json();
  assert.equal(
    (
      await post(
        "/api/admin/research",
        {
          action: "policy",
          sourceId: officialSource.id,
          enabled: true,
          permissionNote: "Fixture review only; no worker is started.",
        },
        a,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post("/api/admin/research", {
        action: "policy",
        sourceId: officialSource.id,
        enabled: true,
        permissionNote: "Fixture review only; no worker is started.",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post("/api/admin/research", {
        action: "policy",
        sourceId: officialSource.id,
        enabled: false,
        permissionNote: "Collection remains paused in HTTP tests.",
      })
    ).status,
    200,
  );

  const { fixtureDetails, fixtureEvidence } =
    await import("../src/catalogue/fixtures");
  const created = await post("/api/admin/opportunities", {
    sourceId: source.id,
    details: { ...fixtureDetails, title: "HTTP reviewed factory course" },
    evidence: fixtureEvidence,
    note: "Record HTTP integration fixture.",
  });
  assert.equal(created.status, 201);
  const draft = await created.json();
  assert.equal(
    (await fetch(base + "/api/opportunities/" + draft.id)).status,
    404,
  );
  const reviewPath = "/api/admin/opportunities/" + draft.id + "/review";
  assert.equal(
    (
      await post(reviewPath, {
        expectedRevision: 1,
        action: "publish",
        note: "Missing evidence attestation.",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post(reviewPath, {
        expectedRevision: 1,
        action: "publish",
        verified: true,
        note: "Check all supplied fixture evidence.",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post(reviewPath, {
        expectedRevision: 1,
        action: "publish",
        verified: true,
        note: "Stale revision must be rejected.",
      })
    ).status,
    409,
  );
  assert.match(
    await (await fetch(base + "/opportunities/" + draft.id)).text(),
    /HTTP reviewed factory course/,
  );
  assert.equal(
    (await (await fetch(base + "/api/opportunities?q=HTTP&language=en")).json())
      .total,
    1,
  );
  assert.equal(
    (await post("/api/me/saved", { opportunityId: draft.id }, b)).status,
    200,
  );
  assert.equal(
    (
      await post(reviewPath, {
        expectedRevision: 2,
        action: "close",
        note: "Close the HTTP fixture record.",
      })
    ).status,
    200,
  );
  assert.equal(
    (await post("/api/me/saved", { opportunityId: draft.id }, b)).status,
    404,
  );
  assert.equal(
    (await (await fetch(base + "/api/opportunities?q=HTTP")).json()).total,
    0,
  );
  assert.equal(
    (
      await (
        await fetch(base + "/api/admin/opportunities/" + draft.id + "/review", {
          headers: { Cookie: admin },
        })
      ).json()
    ).length,
    3,
  );

  assert.match(
    await (await fetch(base + "/matches", { headers: { Cookie: a } })).text(),
    /http-alice@example.test/,
  );
  const preferences = {
    interfaceLanguage: "en",
    alertLanguage: "zh-Hans",
    teachingLanguages: ["en"],
    nationality: "NG",
  };
  const saved = await fetch(base + "/api/me/profile", {
    method: "PATCH",
    headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), preferencesSchema.parse(preferences));
  assert.equal(
    await (
      await fetch(base + "/api/me/profile", { headers: { Cookie: b } })
    ).json(),
    null,
  );
  const forged = await fetch(base + "/api/me/profile", {
    method: "PATCH",
    headers: { Cookie: b, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ ...preferences, userId: "someone-else" }),
  });
  assert.equal(forged.status, 400);
  const denied = await fetch(base + "/api/me/profile", {
    method: "PATCH",
    headers: {
      Cookie: a,
      Origin: "https://invalid.example.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferences),
  });
  assert.equal(denied.status, 403);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await fetch(base + "/api/me/saved", {
          method: "POST",
          headers: {
            Cookie: a,
            Origin: base,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ opportunityId: "synthetic-course" }),
        })
      ).status,
      200,
    );
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/saved", { headers: { Cookie: a } })
      ).json()
    ).length,
    1,
  );
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/saved", { headers: { Cookie: b } })
      ).json()
    ).length,
    1,
  );

  assert.equal((await fetch(base + "/api/me/matches")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/me/matches?userId=someone-else", {
        headers: { Cookie: a },
      })
    ).status,
    400,
  );
  const myMatches = await (
    await fetch(base + "/api/me/matches", { headers: { Cookie: a } })
  ).json();
  assert.ok(
    myMatches.items.some(
      (item: { id: string }) => item.id === "synthetic-course",
    ),
  );
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/matches", { headers: { Cookie: b } })
      ).json()
    ).profileRequired,
    true,
  );
  async function changeTracker(body: unknown, cookie = a, origin = base) {
    return fetch(base + "/api/me/tracker", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }
  const tracked = {
    opportunityId: "synthetic-course",
    expectedVersion: 1,
    action: "status",
    status: "applying",
  };
  assert.equal((await changeTracker(tracked, b)).status, 409);
  assert.equal(
    (await changeTracker({ ...tracked, userId: "someone-else" })).status,
    400,
  );
  assert.equal(
    (await changeTracker(tracked, a, "https://attacker.example.test")).status,
    403,
  );
  assert.equal((await changeTracker(tracked)).status, 200);
  assert.equal((await changeTracker(tracked)).status, 409);
  assert.equal(
    (
      await changeTracker({
        opportunityId: "synthetic-course",
        expectedVersion: 2,
        action: "dismiss",
      })
    ).status,
    200,
  );
  assert.ok(
    !(
      await (
        await fetch(base + "/api/me/matches", { headers: { Cookie: a } })
      ).json()
    ).items.some((item: { id: string }) => item.id === "synthetic-course"),
  );
  assert.equal(
    (
      await changeTracker({
        opportunityId: "synthetic-course",
        expectedVersion: 3,
        action: "restore",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/tracker", { headers: { Cookie: a } })
      ).json()
    )[0].status,
    "applying",
  );

  assert.equal((await fetch(base + "/api/me/notifications")).status, 401);
  assert.equal(
    (await fetch(base + "/notifications", { headers: { Cookie: a } })).status,
    200,
  );
  const alertSettings = {
    expectedVersion: 0,
    enabled: true,
    channel: "telegram",
    frequency: "weekly",
    timezone: "Africa/Lagos",
    consent: true,
  };
  const updateAlerts = (body: unknown, origin = base) =>
    fetch(base + "/api/me/notifications", {
      method: "PATCH",
      headers: {
        Cookie: a,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await updateAlerts({ ...alertSettings, consent: false })).status,
    400,
  );
  assert.equal(
    (await updateAlerts({ ...alertSettings, userId: "someone-else" })).status,
    400,
  );
  assert.equal(
    (await updateAlerts(alertSettings, "https://attacker.example.test")).status,
    403,
  );
  assert.equal((await updateAlerts(alertSettings)).status, 200);
  assert.equal((await updateAlerts(alertSettings)).status, 409);
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/notifications", { headers: { Cookie: b } })
      ).json()
    ).settings.enabled,
    false,
  );
  assert.equal(
    (
      await updateAlerts({
        ...alertSettings,
        expectedVersion: 1,
        enabled: false,
        consent: false,
      })
    ).status,
    200,
  );

  assert.equal((await fetch(base + "/api/me/telegram")).status, 401);
  const tg = (path: string, body: unknown, cookie = a) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: base,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await tg("/api/me/telegram", { userId: "someone-else" })).status,
    400,
  );
  const linkResponse = await tg("/api/me/telegram", {});
  assert.equal(linkResponse.status, 200);
  const telegramLink = await linkResponse.json();
  assert.equal((await tg("/api/me/telegram", {})).status, 429);
  const hook = {
    update_id: 998877,
    message: {
      date: Math.floor(Date.now() / 1000),
      chat: { id: 123000, type: "private" },
      from: { id: 123000, is_bot: false },
      text: telegramLink.startCommand,
    },
  };
  const webhook = (secret: string) =>
    fetch(base + "/api/webhooks/telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": secret,
      },
      body: JSON.stringify(hook),
    });
  assert.equal((await webhook("invalid")).status, 401);
  assert.equal(
    (await webhook(process.env.TELEGRAM_WEBHOOK_SECRET!)).status,
    200,
  );
  assert.equal(
    (await webhook(process.env.TELEGRAM_WEBHOOK_SECRET!)).status,
    200,
  );
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/telegram", { headers: { Cookie: b } })
      ).json()
    ).state,
    "disconnected",
  );
  const changeBinding = (body: unknown, cookie = a) =>
    fetch(base + "/api/me/telegram", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        Origin: base,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await changeBinding({ action: "confirm", expectedVersion: 0 }, b)).status,
    409,
  );
  assert.equal(
    (await changeBinding({ action: "confirm", expectedVersion: 1 })).status,
    200,
  );
  assert.equal(
    (await changeBinding({ action: "disconnect", expectedVersion: 2 })).status,
    200,
  );

  const currentAlerts = (
    await (
      await fetch(base + "/api/me/notifications", { headers: { Cookie: a } })
    ).json()
  ).settings;
  assert.equal(
    (
      await updateAlerts({
        ...alertSettings,
        expectedVersion: currentAlerts.version,
        channel: "email",
      })
    ).status,
    200,
  );
  assert.equal(
    (await tg("/api/me/email-unsubscribe", { userId: "someone-else" })).status,
    400,
  );
  const unsubscribeResponse = await tg("/api/me/email-unsubscribe", {});
  assert.equal(unsubscribeResponse.status, 200);
  const unsubscribeURL = (await unsubscribeResponse.json()).url;
  const landing = await fetch(unsubscribeURL);
  assert.equal(landing.status, 200);
  assert.equal(landing.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/notifications", { headers: { Cookie: a } })
      ).json()
    ).settings.enabled,
    true,
  );
  const nonce = new URL(unsubscribeURL).searchParams.get("token")!;
  assert.equal(
    (
      await fetch(
        base +
          "/api/notifications/unsubscribe?token=" +
          encodeURIComponent(nonce),
      )
    ).status,
    405,
  );
  const oneClick = () =>
    fetch(
      base +
        "/api/notifications/unsubscribe?token=" +
        encodeURIComponent(nonce),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      },
    );
  assert.equal((await oneClick()).status, 200);
  assert.equal((await oneClick()).status, 200);
  assert.equal(
    (
      await (
        await fetch(base + "/api/me/notifications", { headers: { Cookie: a } })
      ).json()
    ).settings.enabled,
    false,
  );
  const emailBody = JSON.stringify({
      type: "email.bounced",
      data: {
        email_id: "synthetic-http-attempt",
        to: ["http-alice@example.test"],
      },
    }),
    emailTimestamp = String(Math.floor(Date.now() / 1000)),
    emailId = "msg_http_email";
  const emailSignature = createHmac(
    "sha256",
    Buffer.from(process.env.EMAIL_WEBHOOK_SIGNING_SECRET!.slice(6), "base64"),
  )
    .update(emailId + "." + emailTimestamp + "." + emailBody)
    .digest("base64");
  const emailHook = (signature: string) =>
    fetch(base + "/api/webhooks/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": emailId,
        "svix-timestamp": emailTimestamp,
        "svix-signature": "v1," + signature,
      },
      body: emailBody,
    });
  assert.equal((await emailHook("invalid")).status, 401);
  assert.equal((await emailHook(emailSignature)).status, 200);
  assert.equal((await emailHook(emailSignature)).status, 200);

  assert.equal((await fetch(base + "/api/me/delivery-tests")).status, 401);
  assert.equal(
    (await fetch(base + "/api/me/delivery-tests", { headers: { Cookie: a } }))
      .status,
    200,
  );
  assert.equal(
    (await tg("/api/me/delivery-tests", { userId: "someone-else" })).status,
    400,
  );
  assert.equal((await tg("/api/me/delivery-tests", {})).status, 409);
  const localizedProfile = await fetch(base + "/api/me/profile", {
    method: "PATCH",
    headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ ...preferences, interfaceLanguage: "zh-Hans" }),
  });
  assert.equal(localizedProfile.status, 200);
  assert.ok(
    localizedProfile.headers
      .getSetCookie()[0]
      .includes("smartmanu_locale=zh-Hans"),
  );
  const savedLocalePage = await (
    await fetch(base + "/sign-in", { headers: { Cookie: a } })
  ).text();
  assert.match(savedLocalePage, /<html lang="zh-Hans"/);
  const otherLocalePage = await (
    await fetch(base + "/sign-in", { headers: { Cookie: b } })
  ).text();
  assert.match(otherLocalePage, /<html lang="en"/);
  const overridden = await (
    await fetch(base + "/sign-in", {
      headers: { Cookie: a + "; smartmanu_locale=en" },
    })
  ).text();
  assert.match(overridden, /<html lang="en"/);
  const independent = await (
    await fetch(base + "/api/me/profile", { headers: { Cookie: a } })
  ).json();
  assert.equal(independent.interfaceLanguage, "zh-Hans");
  assert.equal(independent.alertLanguage, "zh-Hans");
  assert.deepEqual(independent.teachingLanguages, ["en"]);
  const privacyCookie = await login("http-privacy@example.test");
  const exportPath = "/api/me/privacy/export";
  assert.equal((await fetch(base + exportPath)).status, 401);
  const exported = await fetch(base + exportPath, {
    headers: { Cookie: privacyCookie },
  });
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get("cache-control"), "no-store");
  const accountData = await exported.json();
  assert.equal(accountData.account.email, "http-privacy@example.test");
  assert.ok(!JSON.stringify(accountData).includes("http-alice@example.test"));
  assert.equal(
    (
      await fetch(base + exportPath + "?userId=other", {
        headers: { Cookie: privacyCookie },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        "/api/me/privacy/delete",
        { confirmation: "wrong" },
        privacyCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        "/api/me/privacy/delete",
        { confirmation: "DELETE", userId: "other" },
        privacyCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/api/me/privacy/delete", {
        method: "POST",
        headers: {
          Cookie: privacyCookie,
          Origin: "https://attacker.example.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation: "DELETE" }),
      })
    ).status,
    403,
  );
  const deletion = await post(
    "/api/me/privacy/delete",
    { confirmation: "DELETE" },
    privacyCookie,
  );
  assert.equal(deletion.status, 202);
  const { receipt } = await deletion.json();
  assert.equal(
    (
      await fetch(base + "/api/me/profile", {
        headers: { Cookie: privacyCookie },
      })
    ).status,
    401,
  );
  const status = await fetch(base + "/api/privacy/status?receipt=" + receipt);
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal((await status.json()).state, "queued");
  assert.equal(
    (await fetch(base + "/api/privacy/status?receipt=invalid")).status,
    404,
  );
  assert.equal((await fetch(base + "/privacy/status")).status, 200);
  const logout = await fetch(base + "/api/auth/sign-out", {
    method: "POST",
    headers: { Cookie: a, Origin: base, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(logout.status, 200);
  assert.equal(
    (await fetch(base + "/api/me/profile", { headers: { Cookie: a } })).status,
    401,
  );
  console.log(
    "PASS: web HTML, magic-link cookies, private API isolation, profile persistence, saved-item deduplication, origin rejection, locale isolation, translated sign-in and sign-out",
  );
} catch (error) {
  console.error(await readFile(join(dir, "server.log"), "utf8"));
  throw error;
} finally {
  if (server.exitCode === null && server.pid) {
    const exited = once(server, "exit");
    process.kill(-server.pid, "SIGTERM");
    await exited;
  }
  await log.close();
  await rm(dir, { recursive: true, force: true });
}

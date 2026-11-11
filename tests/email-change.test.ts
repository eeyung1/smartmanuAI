import test from "node:test";
import assert from "node:assert/strict";
import {
  EmailChangeError,
  createEmailChangeService,
  createInMemoryEmailDirectory,
} from "../src/auth/email-change";

const secret = "a".repeat(32);

function serviceAt(start = 1_000_000) {
  let now = start;
  const directory = createInMemoryEmailDirectory([
    { id: "user-1", email: "member@example.test" },
    { id: "user-2", email: "other@example.test" },
  ]);
  const service = createEmailChangeService({
    directory,
    secret,
    now: () => now,
    reservedDomains: ["reserved.test"],
  });
  return {
    service,
    directory,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

test("a change request issues a signed token and records an audit event", () => {
  const { service } = serviceAt();
  const request = service.requestEmailChange(
    "user-1",
    "New.Address@Example.Test",
  );
  assert.match(request.token, /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
  assert.ok(request.requestId);
  assert.equal(
    service.requests()[0].newEmail,
    "new.address@example.test",
    "emails are normalized",
  );
  assert.equal(service.requests()[0].status, "pending");
  assert.equal(
    service.audit().filter((event) => event.type === "requested").length,
    1,
  );
});

test("requests are rejected for invalid, reserved, duplicate and unknown cases", () => {
  const { service } = serviceAt();
  const cases: [string, string, string][] = [
    ["user-1", "not-an-email", "invalid_email"],
    ["user-1", "member@example.test", "same_email"],
    ["user-1", "other@example.test", "email_in_use"],
    ["user-1", "someone@reserved.test", "reserved_email"],
    ["missing-user", "new@example.test", "unknown_account"],
  ];
  for (const [actor, email, code] of cases) {
    assert.throws(
      () => service.requestEmailChange(actor, email),
      (error: unknown) =>
        error instanceof EmailChangeError && error.code === code,
      code,
    );
  }
  assert.equal(service.requests().length, 0);
  assert.equal(
    service.audit().filter((event) => event.type === "rejected").length,
    cases.length,
  );
});

test("verification updates the address and invalidates other pending requests", () => {
  const { service, directory } = serviceAt();
  const first = service.requestEmailChange("user-1", "first@example.test");
  const second = service.requestEmailChange("user-1", "second@example.test");
  const verified = service.verifyEmailChange(first.token);
  assert.equal(verified.userId, "user-1");
  assert.equal(verified.email, "first@example.test");
  assert.equal(verified.invalidatedRequests, 1);
  assert.equal(directory.get("user-1")?.email, "first@example.test");
  assert.equal(
    service.requests().find((request) => request.id === second.requestId)
      ?.status,
    "cancelled",
  );
  assert.throws(
    () => service.verifyEmailChange(second.token),
    (error: unknown) =>
      error instanceof EmailChangeError && error.code === "not_pending",
  );
});

test("tampered, expired and unknown tokens are refused", () => {
  const { service, advance } = serviceAt();
  const request = service.requestEmailChange("user-1", "new@example.test");
  const [nonce, signature] = request.token.split(".");
  assert.throws(
    () => service.verifyEmailChange(nonce + "." + "A".repeat(43)),
    (error: unknown) =>
      error instanceof EmailChangeError && error.code === "invalid_token",
  );
  assert.throws(
    () => service.verifyEmailChange("not-a-token"),
    (error: unknown) =>
      error instanceof EmailChangeError && error.code === "invalid_token",
  );
  advance(3_600_001);
  assert.throws(
    () => service.verifyEmailChange(request.token),
    (error: unknown) =>
      error instanceof EmailChangeError && error.code === "expired_token",
  );
  const fresh = serviceAt();
  const orphan = fresh.service.requestEmailChange(
    "user-1",
    "orphan@example.test",
  );
  assert.throws(
    () => service.verifyEmailChange(orphan.token),
    (error: unknown) =>
      error instanceof EmailChangeError && error.code === "unknown_token",
    "a token issued elsewhere is unknown to this service",
  );
  const other = serviceAt();
  assert.throws(
    () =>
      other.service.verifyEmailChange(
        nonce.slice(0, 43) + "." + "B".repeat(43),
      ),
    (error: unknown) =>
      error instanceof EmailChangeError && error.code === "invalid_token",
  );
});

test("cancelling removes pending requests and audit records the transition", () => {
  const { service, directory } = serviceAt();
  service.requestEmailChange("user-1", "new@example.test");
  const cancelled = service.cancelEmailChange("user-1");
  assert.equal(cancelled.cancelled, 1);
  assert.equal(
    service.audit().filter((event) => event.type === "cancelled").length,
    1,
  );
  assert.equal(directory.get("user-1")?.email, "member@example.test");
  assert.equal(service.cancelEmailChange("user-1").cancelled, 0);
});

test("requests are rate limited to three per day", () => {
  const { service, advance } = serviceAt();
  for (let index = 0; index < 3; index++)
    service.requestEmailChange("user-1", `new-${index}@example.test`);
  assert.throws(
    () => service.requestEmailChange("user-1", "new-3@example.test"),
    (error: unknown) =>
      error instanceof EmailChangeError && error.code === "rate_limited",
  );
  advance(86_400_001);
  const allowed = service.requestEmailChange("user-1", "new-4@example.test");
  assert.ok(allowed.token);
});

test("a signing secret is required and verification stays deterministic", () => {
  assert.throws(
    () => createEmailChangeService({ secret: "short" }),
    (error: unknown) =>
      error instanceof EmailChangeError && error.code === "missing_secret",
  );
  const { service } = serviceAt();
  const request = service.requestEmailChange("user-1", "new@example.test");
  assert.equal(
    service.verifyEmailChange(request.token).email,
    "new@example.test",
  );
});

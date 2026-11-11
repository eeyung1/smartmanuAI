import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export class EmailChangeError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EmailChangeError";
  }
}

export type EmailChangeAccount = {
  id: string;
  email: string;
};

export type EmailChangeRequestStatus =
  "pending" | "verified" | "cancelled" | "expired";

export type EmailChangeRequest = {
  id: string;
  userId: string;
  newEmail: string;
  status: EmailChangeRequestStatus;
  createdAt: number;
  expiresAt: number;
  tokenHash: string;
};

export type EmailChangeAuditEvent = {
  type: "requested" | "verified" | "cancelled" | "rejected";
  userId: string | null;
  requestId: string | null;
  at: number;
  code?: string;
};

export type EmailChangeDirectory = {
  get(userId: string): EmailChangeAccount | null;
  findByEmail(email: string): EmailChangeAccount | null;
  update(userId: string, email: string): void;
};

export type EmailChangeServiceOptions = {
  directory?: EmailChangeDirectory;
  accounts?: readonly EmailChangeAccount[];
  secret?: string;
  now?: () => number;
  ttlMs?: number;
  maxRequests?: number;
  windowMs?: number;
  reservedDomains?: readonly string[];
  idFactory?: () => string;
};

export type EmailChangeService = {
  requestEmailChange(
    actor: string,
    newEmail: string,
  ): { requestId: string; token: string; expiresAt: string };
  verifyEmailChange(token: string): {
    userId: string;
    email: string;
    invalidatedRequests: number;
  };
  cancelEmailChange(actor: string): { cancelled: number };
  audit(): EmailChangeAuditEvent[];
  requests(): EmailChangeRequest[];
  directory: EmailChangeDirectory;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function createInMemoryEmailDirectory(
  accounts: readonly EmailChangeAccount[] = [],
): EmailChangeDirectory {
  const directory = new Map<string, EmailChangeAccount>();
  for (const account of accounts)
    directory.set(account.id, {
      id: account.id,
      email: normalizeEmail(account.email),
    });
  return {
    get(userId) {
      const found = directory.get(userId);
      return found ? { ...found } : null;
    },
    findByEmail(email) {
      const target = normalizeEmail(email);
      for (const account of directory.values())
        if (account.email === target) return { ...account };
      return null;
    },
    update(userId, email) {
      const account = directory.get(userId);
      if (account) account.email = normalizeEmail(email);
    },
  };
}

/**
 * Verified account email change with signed confirmation tokens, bounded
 * request windows and auditable transitions. All state is local to the
 * service instance and no provider request is performed here.
 */
export function createEmailChangeService(
  options: EmailChangeServiceOptions = {},
): EmailChangeService {
  const directory =
    options.directory ?? createInMemoryEmailDirectory(options.accounts ?? []);
  const secret = options.secret ?? "";
  if (secret.length < 32)
    throw new EmailChangeError(
      500,
      "missing_secret",
      "Email change requires a signing secret of at least 32 characters.",
    );
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? 3_600_000;
  const maxRequests = options.maxRequests ?? 3;
  const windowMs = options.windowMs ?? 86_400_000;
  const reservedDomains = (options.reservedDomains ?? []).map((domain) =>
    domain.trim().toLowerCase().replace(/^\./, ""),
  );
  const idFactory = options.idFactory ?? (() => randomUUID());
  const requests: EmailChangeRequest[] = [];
  const auditLog: EmailChangeAuditEvent[] = [];

  const signature = (nonce: string) =>
    createHmac("sha256", secret)
      .update("email-change-v1:" + nonce)
      .digest("base64url");

  const record = (
    type: EmailChangeAuditEvent["type"],
    userId: string | null,
    requestId: string | null,
    code?: string,
  ) => {
    auditLog.push({
      type,
      userId,
      requestId,
      at: now(),
      ...(code ? { code } : {}),
    });
  };

  // A declared function keeps TypeScript's control-flow narrowing for the
  // rejection paths below.
  function reject(
    status: number,
    code: string,
    message: string,
    userId: string | null = null,
    requestId: string | null = null,
  ): never {
    record("rejected", userId, requestId, code);
    throw new EmailChangeError(status, code, message);
  }

  const requestEmailChange = (actor: string, newEmail: string) => {
    if (typeof actor !== "string" || !actor.trim())
      reject(400, "invalid_actor", "An account is required to change email.");
    const account = directory.get(actor);
    if (!account) reject(404, "unknown_account", "Account not found.", actor);
    if (typeof newEmail !== "string" || newEmail.length > 320)
      reject(400, "invalid_email", "Enter a valid email address.", actor);
    const email = normalizeEmail(newEmail);
    if (!EMAIL_PATTERN.test(email))
      reject(400, "invalid_email", "Enter a valid email address.", actor);
    const domain = email.split("@")[1] ?? "";
    if (reservedDomains.includes(domain))
      reject(
        400,
        "reserved_email",
        "That email domain is not available.",
        actor,
      );
    if (account.email === email)
      reject(409, "same_email", "That is already your email address.", actor);
    const owner = directory.findByEmail(email);
    if (owner && owner.id !== actor)
      reject(
        409,
        "email_in_use",
        "That email address is already registered to another account.",
        actor,
      );
    const timestamp = now();
    const recent = requests.filter(
      (request) =>
        request.userId === actor &&
        request.createdAt > timestamp - windowMs &&
        request.status !== "cancelled",
    );
    if (recent.length >= maxRequests)
      reject(
        429,
        "rate_limited",
        "Too many email change requests. Try again later.",
        actor,
      );
    const nonce = randomBytes(32).toString("base64url");
    const request: EmailChangeRequest = {
      id: idFactory(),
      userId: actor,
      newEmail: email,
      status: "pending",
      createdAt: timestamp,
      expiresAt: timestamp + ttlMs,
      tokenHash: hash(nonce),
    };
    requests.push(request);
    record("requested", actor, request.id);
    return {
      requestId: request.id,
      token: nonce + "." + signature(nonce),
      expiresAt: new Date(request.expiresAt).toISOString(),
    };
  };

  const verifyEmailChange = (token: string) => {
    if (
      typeof token !== "string" ||
      !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)
    )
      reject(400, "invalid_token", "Invalid confirmation link.");
    const [nonce, signatureValue] = token.split(".");
    const expected = signature(nonce);
    if (
      signatureValue.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signatureValue), Buffer.from(expected))
    )
      reject(400, "invalid_token", "Invalid confirmation link.");
    const request = requests.find(
      (candidate) => candidate.tokenHash === hash(nonce),
    );
    if (!request) reject(400, "unknown_token", "Invalid confirmation link.");
    if (request.status !== "pending")
      reject(
        409,
        "not_pending",
        "This confirmation link is no longer usable.",
        request.userId,
        request.id,
      );
    if (now() > request.expiresAt) {
      request.status = "expired";
      reject(
        410,
        "expired_token",
        "This confirmation link has expired.",
        request.userId,
        request.id,
      );
    }
    const account = directory.get(request.userId);
    if (!account)
      reject(
        404,
        "unknown_account",
        "Account not found.",
        request.userId,
        request.id,
      );
    const owner = directory.findByEmail(request.newEmail);
    if (owner && owner.id !== request.userId)
      reject(
        409,
        "email_in_use",
        "That email address is already registered to another account.",
        request.userId,
        request.id,
      );
    directory.update(request.userId, request.newEmail);
    request.status = "verified";
    let invalidated = 0;
    for (const candidate of requests)
      if (
        candidate.userId === request.userId &&
        candidate.id !== request.id &&
        candidate.status === "pending"
      ) {
        candidate.status = "cancelled";
        invalidated++;
      }
    record("verified", request.userId, request.id);
    return {
      userId: request.userId,
      email: request.newEmail,
      invalidatedRequests: invalidated,
    };
  };

  const cancelEmailChange = (actor: string) => {
    if (typeof actor !== "string" || !actor.trim())
      reject(
        400,
        "invalid_actor",
        "An account is required to cancel a request.",
      );
    let cancelled = 0;
    for (const request of requests)
      if (request.userId === actor && request.status === "pending") {
        request.status = "cancelled";
        cancelled++;
      }
    if (cancelled) record("cancelled", actor, null);
    return { cancelled };
  };

  return {
    requestEmailChange,
    verifyEmailChange,
    cancelEmailChange,
    audit: () => auditLog.map((event) => ({ ...event })),
    requests: () => requests.map((request) => ({ ...request })),
    directory,
  };
}

let defaultService: EmailChangeService | null = null;

/** Process-wide service used by the module-level helpers. */
export function emailChangeService(options: EmailChangeServiceOptions = {}) {
  defaultService ??= createEmailChangeService(options);
  return defaultService;
}

export function requestEmailChange(
  actor: string,
  newEmail: string,
  options: EmailChangeServiceOptions = {},
) {
  return emailChangeService(options).requestEmailChange(actor, newEmail);
}

export function verifyEmailChange(
  token: string,
  options: EmailChangeServiceOptions = {},
) {
  return emailChangeService(options).verifyEmailChange(token);
}

export function cancelEmailChange(
  actor: string,
  options: EmailChangeServiceOptions = {},
) {
  return emailChangeService(options).cancelEmailChange(actor);
}

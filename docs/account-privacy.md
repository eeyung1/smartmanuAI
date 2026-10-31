# Account export and deletion

Implemented locally on 31 October 2026. No production privacy or legal-compliance claim is made.

## User flow

Visit `/privacy` after signing in. Export and deletion require a session created within ten minutes; older sessions must sign in again. The JSON download contains the account, preferences, tracker, notification settings, Telegram connection summary, digest/delivery metadata and session dates. Credentials, raw mail, encrypted requests, link tokens and shared catalogue records are excluded. This is a profile/activity export, not a complete subject-access response.

Type DELETE to request deletion. The transaction disables alerts, suppresses pending digests and queued simulation jobs, marks in-flight sends uncertain, revokes Telegram connections and all sessions, then queues a durable deletion request. An already-started request cannot be recalled. Accounts attributed to shared source/review history receive a conflict with no deletion queued; an operator-assisted anonymization policy is required before launch.

Save the opaque private receipt displayed once. `/privacy/status` checks completion without signing in; only its hash is stored. Receipt responses expose state and dates, with no account identity. Receipts are bearer capabilities and should not be shared.

## Worker and concurrency

Stop the app before `npm run privacy:once` when using embedded PGlite, which permits one owning process. Each invocation processes at most one request. PostgreSQL workers claim requests with row locks and skip locked requests. The worker atomically removes account-owned SQL records, dependent simulation records, sink messages and authentication verification records. It also removes associated Telegram chat event correlation and scrubs email callback correlation. The account reference on the receipt becomes null.

Local authentication mail is filtered under the same filesystem lock used by mail writers, using an atomic rename. Other recipients are preserved. Malformed mail aborts the purge for operator repair; database changes roll back and the queued request remains retryable. A crash after mail removal but before commit is safe to retry. A crash while holding `mail.lock` fails closed: stop every app/worker, inspect for a live writer, remove the stale empty lock directory, then retry. Never break a live writer's lock.

Owner locks serialize new private inserts and deletion requests. Pending-account triggers reject new private writes; planner and legacy sink workers acquire the owner before work rows. Conditional simulation completion discards cancelled claims. Updates check pending state without acquiring an extra owner lock from inside a row trigger, avoiding reverse lock acquisition; private mutation services retain owner-first locking.

## Limits and release gates

Minimal keyed destination suppression markers and anonymous receipt dates remain. Shared opportunities and their public review audit remain. Provider records, backups, security-log retention, key retirement, receipt expiry, deletion service levels and suppression-marker retention need explicit production policies. A completed receipt means the application database and local authentication mail purge completed, not that every backup or third-party record has expired. No live provider or deployment has been enabled.

## Validation

The privacy suite covers recent-authentication boundaries, isolated exports, strict confirmation, session revocation, pending-write fencing, blocked reauthentication, durable restart, malformed-mail rollback, repeatable purge and preservation of another account. It runs on PGlite and PostgreSQL 16 in CI. HTTP checks cover authenticated download, forged owner/origin rejection, deletion, revoked cookies and public receipt lookup. Browser visual validation remains pending.

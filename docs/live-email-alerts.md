# Email-only live-alert pilot

The production Alerts screen has a separate Brevo path. Local simulation consent (`local-sink-v1`) never authorizes real email. The new `brevo-email-v1` consent covers opportunity digests and explicitly requested delivery tests at the signed-in account's verified email. Telegram remains deferred.

## Owner setup

Apply migration `029_live_email_alerts.sql` only in the private `smartmanuai` schema, recording it in that schema's migration ledger. Enable RLS, revoke public/client/reader access and grant only the existing backend application role DML with its backend policy on the five new tables. Never rerun the empty-database bootstrap on the shared hosted project.

Use Vercel Production server-only configuration:

| Setting | Purpose |
| --- | --- |
| `SMARTMANU_EMAIL_ALERTS_ENABLED=1` | Sending and live settings switch |
| `SMARTMANU_OPERATOR_EMAIL` | Verified operator allowed to connect callbacks |
| `NOTIFICATION_UNSUBSCRIBE_KEY` | Independent random 32-byte hex HMAC key |
| `BREVO_WEBHOOK_SECRET` | Independent random 32-byte hex callback bearer token |
| `CRON_SECRET` | Independent random 32-byte hex Vercel job bearer token |
| Existing `BREVO_API_KEY`, `EMAIL_FROM` | Existing provider credentials; no additional email provider |

Keep credentials out of Git, browser code, URLs and logs. Do not replace shared provider security settings. Brevo may require its normal IP authorization or webhook permissions. The setup route exposes only a fixed failure message and logs HTTP status plus a fixed category. It never returns provider bodies, keys or tokens.

1. Sign in as the configured operator and open `/notifications`.
2. Click **Connect Brevo callbacks**. The app registers bearer authentication for its exact callback URL. Other projects' webhook URLs are untouched. Existing exact-URL hooks are updated; malformed provider listings fail closed.
3. Enable email, choose daily/weekly and an IANA timezone, explicitly consent and save.
4. Click **Send test email** once. This is clearly labelled as a delivery test, not a scholarship. Accepted means the provider accepted the request; refresh history to check delivered or failure callbacks.
5. Complete and save a profile for matching. Verify a real, reviewed opportunity digest and its unsubscribe confirmation separately before marking live acceptance complete.

No personal test email is sent by migrations, deployment checks, fixtures or webhook setup.

## Queue and scheduling

Vercel invokes `GET /api/cron/email-alerts` once daily with `Authorization: Bearer CRON_SECRET`, scheduled at `0 9 * * *`. Hobby scheduling is within its configured hour, not exact-minute delivery. A daily or Monday weekly digest becomes due at 09:00 in the user's timezone and is processed on the next UTC run, sometimes the following day. This is a bounded pilot: each run plans and dispatches at most five accounts/messages. A growing audience needs capacity and fairness work before public release.

Digests use existing deterministic profile matching and reviewed published records with verification no older than 24 hours and not in the future. Synthetic sources and non-HTTPS evidence URLs are excluded. Facts are rechecked immediately before sending under user/preference/profile/opportunity/source locks. No matches means no message. At most ten items are included. Material-fact identities are deduplicated per account. Claimed facts remain claimed after failure/suppression; manual review is required rather than silent automatic retries.

A committed `pending → dispatching` update fences duplicate workers before provider I/O. Separate committed quota reservations and signed unsubscribe tokens survive the send transaction. Quotas are 3 attempts per recipient and 10 global per UTC day, including tests and failed/uncertain/suppressed reservations. They are additional to sign-in quotas and the provider's shared-account limits. Transport timeout is 15 seconds. A network timeout, missing receipt, provider 5xx or interrupted send is uncertain and never automatically resent. Stale dispatches become uncertain after five minutes. Failed sends are also not automatically retried. The operator must investigate them.

## Callbacks, unsubscribe and privacy

`POST /api/webhooks/brevo-alerts` authenticates a dedicated bearer secret before accessing the database, bounds the request and ignores uncorrelated messages, including authentication emails and other projects' traffic. A fixed UUID correlation header, recipient HMAC and canonical provider message ID bind receipts to a delivery. Events are persisted/deduplicated. Authenticated callbacks can reconcile uncertain sends without resending. Bounce, complaint, block, invalid-address and unsubscribe events use persistent destination suppression; later delivered events cannot clear a negative state. Early callbacks are reconciled against trusted attempts. Only normalized metadata is stored.

Each email includes a signed, expiring unsubscribe link. GET opens a confirmation page without changing state; POST pauses only its consent epoch. Old tokens cannot pause a newly authorized epoch. The app does not claim provider/domain DKIM or RFC 8058 mailbox one-click qualification. Suppression pauses queued messages. Callback and unsubscribe controls remain available when the sending flag is off, as long as their keys and production mode remain configured.

The owner history endpoint returns only the signed-in account's latest 20 deliveries. Account exports include delivery status metadata; queued deletion suppresses pending sends and fences in-flight ones before revoking sessions. Foreign-key cascades purge delivery/seen/event rows. Provider-side retention and erasure remain operational release work. Never rotate the unsubscribe key casually: it invalidates existing links and changes suppression identity hashes.

## Validation and limits

PGlite and PostgreSQL fixtures cover fresh consent, operator webhook setup contracts, other-project isolation, missing/malformed listings, synthetic exclusion, duplicate workers, signed unsubscribe, sticky bounce suppression, recipient/message validation, callback replay, freshness, material deduplication, uncertain receipt recovery, quotas, deletion/export and stale crash fencing. Screen/error checks cover English and Simplified Chinese. Tests use mocked provider calls and isolated fixture databases.

The hosted catalogue was empty and no profile was stored at the pre-deployment checkpoint. Live source discovery, provider permission/IP acceptance, real digest delivery/opt-out, a measured cron cycle, retention policies and public-release acceptance remain unchecked until observed. This feature does not authorize public signup or paid services.

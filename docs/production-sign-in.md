# Production sign-in pilot

This increment enables real-address Better Auth magic links through Brevo for an
explicit pilot allowlist. It is not public launch or live scholarship alerts.

## Configuration and database

Production requires the existing HTTPS Vercel origin, private `smartmanuai`
schema, verified TLS CA, a `smartmanuai_app.PROJECT_REF` pooler credential in
`SMARTMANU_APP_DATABASE_URL`,
`BREVO_API_KEY`, `EMAIL_FROM` and 1–20 comma-separated `SMARTMANU_PILOT_EMAILS`.
No secret belongs in source control or a `NEXT_PUBLIC_` variable. Preview and
local deployments must not receive these production credentials.

Apply migration 028 as the existing owner, inside smartmanuai, and record it in
the application migration ledger. Enable RLS on its new quota table and revoke
public API roles. Health requires 28 migrations. Do not rerun the initial
staging bootstrap on the existing shared project.

The reviewed `db/production/app-role.sql` creates a separate backend role with
schema usage, table SELECT, ordinary application INSERT/UPDATE/DELETE and
invoker-function execution. It has no ownership, schema CREATE, TRUNCATE,
BYPASSRLS, owner membership, role administration or database administration.
`admin_roles` and `schema_migrations` are SELECT-only. Its RLS policies permit
backend service access; session authorization and owner predicates remain in
the server application, not Supabase JWT policies. This is a trusted backend
credential, never a browser credential. Other projects receive no grants.
Future tables need separately reviewed grants. Keep the original reader role
for rollback to read-only staging.

Hosted auth ORM tables explicitly name the application schema. Raw SQL uses
transaction-local search paths; startup never runs hosted migrations.

## Delivery and verification

Only invited addresses may request a link. The send path checks queued account
deletion and a persisted, unexpired hashed verification token before contacting
Brevo. Links expire after ten minutes and successful verification consumes them.
HTTPS sessions use secure cookies. Local `.test` mail and read-only staging
retain their previous behavior.

Atomic quota reservations permit at most 20 sign-in delivery attempts per UTC
day across all instances and five per recipient per day. Failed/uncertain sends
consume reservations and are not automatically retried. Buckets contain hashes,
not email addresses. Provider acceptance is not proof of inbox delivery.

Validate the pilot using the real form and invited mailbox: request one link,
check the inbox/spam folder, follow it, verify the signed-in private page and
confirm replay is rejected. Do not print links, tokens, cookies or keys in logs.
No real pilot email is sent by automated fixture tests.

## Separate remaining work

Live alert consent, persisted delivery-worker/provider binding, Brevo-authenticated
bounce/complaint callbacks, scheduling, discovery/model qualification, retention
operations and public-pilot acceptance remain open. Channel simulation flags and
collection/paid execution remain disabled. Existing private screens may still
describe their fixture-only notification behavior; the pilot banner states this.

For rollback, set `SMARTMANU_MODE=staging` and redeploy. The original reader
`DATABASE_URL` remains unchanged; production selects the separate app URL. Do not drop account data or disable
RLS. An older build also tolerates additive migration 028.

## Verified pilot checkpoint — 15 November 2026

The owner confirmed receipt of the Brevo sign-in email, followed the link and
signed in. A read-only database check confirmed one verified pilot account and
one unexpired session. The owner also confirmed access to My space. A follow-up
check found no saved profile row yet, so profile persistence remains unverified.
No session tokens, sign-in URLs or credentials were retrieved for these checks.

The deployed database health check returns production mode with database
connected. The owner-confirmed session pooler is
`aws-0-eu-west-1.pooler.supabase.com`; the application uses its dedicated backend
role and private schema. Brevo IP authorization was required during testing.
One recipient retry was restored after unsuccessful setup attempts; the shared
daily cap remained unchanged. This exception did not disable quota enforcement.

This verifies the sign-in pilot only. Automated scholarship emails, Telegram
binding, production delivery callbacks, discovery and scheduled execution remain
open. Next, the owner can create the Telegram bot through official BotFather;
the bot token must be stored as a server-side secret, never in this document.

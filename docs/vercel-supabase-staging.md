# Vercel and Supabase staging

This checkpoint prepares a read-only hosted preview, not public-MVP acceptance. The Vercel project is `smartmanuai` in the owner's `eeyung1` workspace. The database target is the existing Supabase `l2e-studylink` project, using a dedicated private `smartmanuai` schema. Other projects' schemas and Supabase Auth settings are outside this change.

## Scope

The preview supports public reviewed-catalogue reads and `/api/health`. A staging banner explains that sign-in and notifications are unavailable. Authentication requests return 503 without creating a verification token or writing local mail. Account actions and private endpoints do not become accessible through the preview. No fake opportunities or subscriber records are seeded into the hosted database.

The existing local mode, `.test` mail sink, private user flows and fixture workers remain available for local development. Staging explicitly rejects collection/paid-research enablement and channel simulation modes. No cron, background research runtime, SMTP provider, Telegram bot or live sender is deployed.

## Database isolation

`db/staging/bootstrap.sql` is generated from the existing twelve application migrations by `node --import tsx scripts/prepare-staging-schema.ts`. It is an initial, additive bootstrap for an empty namespace; do not rerun it over an existing schema. Review and apply it once through the Supabase migration tool after validation. It creates:

- A non-login `smartmanuai_owner` role and private application schema.
- All related catalogue, job, auth, notification, privacy and migration-tracking tables in that schema, without copying other projects' data.
- Row-level security on every new table; no public Data API grants.
- Fixed search paths and revoked public execution for app trigger/functions.
- A non-login `smartmanuai_reader` role with only schema usage and SELECT on reviewed opportunities, their supporting sources and migration names, subject to explicit RLS policies.

Activate a generated reader credential only when ready to store it as a secret in Vercel. Do not change the shared project's `postgres` password or use its service-role API key. The reader has no write, schema-creation or private-account grants and does not inherit the owner role. Backend connection tests must verify the role and schema rather than relying only on a successful TCP connection.

Runtime queries use short transactions with `SET LOCAL search_path=smartmanuai,pg_catalog`; no persistent session-level setting is required by transaction pooling. TLS certificate verification stays enabled. Pool size is bounded to two connections per instance. Hosted startup never creates tables or runs migrations; migrations are an operator-controlled step. The auth ORM is not used in staging because hosted account access is disabled.

## Vercel environment

Set values through the connected Vercel environment API/dashboard, not Git. Production here names Vercel's stable deployment target; the application remains in staging mode. Do not share its database credential with arbitrary PR previews.

| Key                              | Value/source                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SMARTMANU_MODE`                 | `staging`                                                                                      |
| `BETTER_AUTH_URL`                | `https://smartmanuai.vercel.app`                                                               |
| `BETTER_AUTH_SECRET`             | Dedicated generated secret; never committed or printed                                         |
| `SMARTMANU_SUPABASE_PROJECT_REF` | The selected `l2e-studylink` project reference                                                 |
| `DATABASE_URL`                   | Dedicated reader at the dashboard-verified shared transaction pooler; password percent-encoded |

Leave all research enablement, email, Telegram and delivery-test modes unset. The configuration accepts only the explicit HTTPS Vercel origin and dedicated Supabase reader username. This mode is intentionally narrower than a general production configuration.

Vercel uses Node 24, the Next.js preset, `npm ci` and `npm run build`; functions are placed in Dublin beside the Ireland database region. Keep the project's default deployment protection. The stable Vercel URL may therefore require the owner's Vercel login. No paid upgrade or new Supabase project is required by this setup.

## Verification

Local/CI tests cover staging configuration rejection, disabled authentication without database/mail initialization, deterministic bootstrap SQL, RLS/role restrictions and schema-pinned queries. Existing local HTTP, domain, build and fixture-agent checks remain required. The initial application suite adds five cases to the previous 61-test baseline, including a PostgreSQL-specific isolation case.

After provisioning and deploying the tested commit, verify the deployment reaches READY, inspect logs, fetch `/api/health` for connected/read-only staging status, fetch catalogue/detail/error screens, verify sign-in clearly reports unavailable, and confirm private/API writes cannot proceed. Use the connector's protected-deployment fetch capability if default Vercel authentication applies. A green build alone does not prove database connectivity.

## Remaining gates

Real user sign-in needs a reviewed email provider/identity setup and a scoped server-side account role; do not grant the public reader access to private tables to bypass this. Full production consent, live channels, recurring jobs, durable agent hosting, secret rotation, backup/restore, retention, browser/mobile acceptance and public-release authorization remain separate work. The shared database's maintenance/upgrades require their own coordinated change because other projects use it.

## Hosted connection repair (5 November 2026)

The Vercel production target serves the read-only staging configuration. Set the five required configuration keys listed above plus `SMARTMANU_DATABASE_CA_CERT` to the complete PEM root CA downloaded from Supabase Database Settings. The PostgreSQL client validates the certificate chain and pooler hostname; never disable verification. The CA is a public trust anchor, not a private key. Supabase's current root has SHA-256 fingerprint `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. Recheck the official certificate when rotating it.

Migrations 013–015 were applied to `smartmanuai` in the existing `l2e-studylink` project, creating onboarding progress, reminder preferences and archive state support. There are 39 application tables with RLS and 15 application migration records. No source or opportunity fixtures were inserted. The reader has no account-reading or catalogue-writing privileges.

After every configuration change, redeploy and require `/api/health` to return HTTP 200 with `database: connected`, then verify `/opportunities` renders. Deployment READY alone does not establish database health. Authentication, background research and live channels remain disabled in this mode.

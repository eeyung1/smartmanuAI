# Local scaffold and runtime validation

Checked 29 October 2026. This is an executable local spike, not a public release. It implements part of Stage 2 and investigates the runtime questions from [provider feasibility](provider-feasibility.md).

## What exists

- A Next.js application with an opportunity preview, email sign-in and a private workspace.
- Better Auth email magic links with hashed single-use tokens, sessions, expiry and sign-out. Only synthetic addresses ending in `.test` are accepted by the local mail adapter.
- Independent interface, alert and teaching-language preferences, plus private saved-item storage. The prototype remains English; the selectors validate persistence, not completed translations.
- Versioned SQL migration for authentication, profiles, saved items, local notification preferences, outbox, sink and budget reservations.
- A PGlite local database for zero-account setup. A local PostgreSQL driver is wired through `DATABASE_URL`, but that driver has not been exercised against a PostgreSQL server in this environment.
- An eve fixture agent with an explicit just-bash environment, optional default tools disabled and one typed `read_fixture` tool. No live model, search or notification provider is configured.
- A database notification sink with transactional deduplication, a final consent check and atomic budget reservations.

The Next.js application uses the repository-root `app/` directory for this spike. The earlier `apps/web/` structure was a proposal, not a migration requirement. The web and agent have independent build/start commands in the same repository.

## Run locally

Requires Node.js 24 on Linux or macOS. The restart scripts use POSIX process groups and symlinks. Windows users should use WSL.

```sh
npm ci
npm run setup:local
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:3000`. Choose Sign in and enter an address such as `alice@example.test`. Read the newest matching URL in `.local/mail.jsonl` and open it in that same browser. This file is a private local credential sink, not an inbox; never publish or commit it. The verification link creates a real local session cookie.

The setup command creates random private secrets in `.env.local` without overwriting an existing file. The file and local data are ignored by Git. No live-provider credentials are needed. Local runtime configuration rejects a public base URL, a remote database, missing secrets or a non-local mode.

Do not run two processes against the same PGlite data directory. Use the web process alone for interactive use; the automated tests allocate isolated data directories. A separate local PostgreSQL server can be selected by a loopback `DATABASE_URL` for later driver validation.

## Run checks

```sh
npm run check
npm audit --omit=dev --audit-level=high
```

`check` runs formatting, TypeScript, integration tests, the Next.js build, web HTTP checks, the eve build and the agent restart spike. Run `setup:local` first. The agent spike uses port 3101 and the web HTTP check uses port 3000; stop interactive servers on those ports first. Do not run multiple `check` commands concurrently.

Individual commands:

| Command               | Evidence it provides                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`            | Seven domain and database integration tests using isolated PGlite directories                                                                       |
| `npm run build`       | Production-mode Next.js compilation, typing and route generation                                                                                    |
| `npm run test:http`   | Starts the built app; checks HTML, magic-link cookies, private API ownership, origin protection and sign-out                                        |
| `npm run agent:build` | Compiles the pinned eve agent with the explicit sandbox environment                                                                                 |
| `npm run spike`       | Starts the built agent, rejects unauthenticated access, validates the fixture turn and reconnects to a settled session after a hard process restart |

The CI workflow runs the same local check sequence without production secrets or paid services. A dependency override pins patched `undici` releases within the dependency's existing major versions; retain the audit and runtime checks when upgrading them.

## Verification boundaries

| Boundary                                               | Status and evidence                                                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web compilation                                        | Next.js build passes                                                                                                                                      |
| Identity and SQL                                       | Real local magic links, replay rejection, expiry, session reads and sign-out pass                                                                         |
| User ownership                                         | Two-account profile and saved-item isolation pass through integration tests and real HTTP routes                                                          |
| Preference persistence                                 | Three independent language fields round-trip through the private API                                                                                      |
| Notification sink                                      | Queued records survive database close and a new worker process; repeat dispatch does not duplicate delivery                                               |
| Consent                                                | Opt-out before dispatch suppresses the queued local message                                                                                               |
| Cost reservation                                       | Concurrent requests cannot reserve more than the configured database budget                                                                               |
| Agent capability surface                               | The fixture model checks the actual advertised tools on each call and fails on anything beyond the fixture tool and framework reply capability            |
| Structured output                                      | Schema validation rejects an invented zero certificate fee or bypassed review flag                                                                        |
| Settled agent recovery                                 | Snapshot history persists across SIGKILL; a fresh client attaches to the same session ID and continues                                                    |
| Browser interaction and visual layout                  | Not validated: the headless browser download failed in this environment. HTTP rendering and API tests do not substitute for browser clicks or screenshots |
| Managed PostgreSQL, regional access and provider email | Not tested; no managed account was provisioned                                                                                                            |
| Real AI extraction quality                             | Not tested: the deterministic model returns a fixed synthetic extraction and synthetic token usage                                                        |

## Recovery limitation found

Early runs that killed the agent immediately after its reply sometimes timed out on continuation. The current spike waits for a settled event snapshot, isolates its workflow storage, and reconnects with a fresh client after restarting. This validates the narrower checkpoint recovery case; it does not establish arbitrary in-flight crash recovery or justify a production durability claim.

The local outbox sink is transactionally idempotent because both the sink receipt and outbox state share one database transaction. Real email or Telegram side effects do not share that transaction. Provider idempotency, uncertain-send handling and full queue leases remain implementation work.

The agent has no shell or arbitrary fetch tools. just-bash itself is not a native security isolation boundary. The fixture does not evaluate whether a real model would resist source prompt injection. Its mock token counts exercise control plumbing, not a cost forecast.

## What is still required

1. Exercise the PostgreSQL adapter and migrations against a real local PostgreSQL server, including concurrent access and restart scenarios.
2. Resolve and retest the in-flight eve recovery failure before hosted research execution.
3. Implement the reviewed catalogue, evidence revisions, source admission and admin publishing workflow.
4. Build full onboarding and translated screens after selecting launch locales.
5. Add live-provider adapters behind explicit configuration, quota accounting, outbox leases and signed webhook handling.
6. Run browser-based acceptance tests, benchmark hosting memory and reconfirm prices before provisioning.
7. Resolve the launch decisions in the [delivery workflow](delivery-workflow.md). Public release remains gated.

No real messages were sent, no paid model calls were made and no hosted services were created by this work.

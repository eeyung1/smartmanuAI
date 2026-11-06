# smartmanuAI Delivery Workflow

Version 0.1 | 29 October 2026

## 1 Required repository workflow

Use this workflow for subsequent changes, continuing the branch and pull request process used for the PRD:

1. Read the current PRD, relevant design documents and any repository instructions.
2. Create a focused branch from current main. Use docs/, feat/ or fix/ prefixes.
3. Make a complete, reviewable change, keeping confirmed requirements separate from proposals.
4. Run checks appropriate to the change and inspect the diff. Documentation changes require content, links, diagrams and requirement coverage checks; application changes require relevant automated tests.
5. Open a pull request explaining behavior, scope, validation and unresolved limitations.
6. Check mergeability, required checks and review rules. Never bypass branch protections, dismiss blocking reviews or force-push main.
7. Merge when authorized and requirements are satisfied. Verify the resulting files or behavior on main.
8. Report the pull request and concrete result. Do not claim a live deployment from a documentation merge.

The project owner has requested this branch, PR and merge workflow for the current design work. Future merges and deployments follow the scope of the corresponding task and repository protections.

## 2 Planning baseline and document order

| Document | Purpose |
| --- | --- |
| [Product requirements](smartmanuAI_PRD_v0_1.md) | User goals, scope, functional requirements and release gates |
| [Screen flows](screen-flows.md) | Navigation, user actions, error states and screen acceptance |
| [Technical architecture](technical-architecture.md) | Components, data, contracts, research and notification semantics |
| [Provider feasibility](provider-feasibility.md) | Provider candidates, budget scenarios and unresolved runtime gates |
| [Source assessment](source-feasibility.md) | Official source observations and collection boundaries |
| [Budget worksheet](pilot-budget.json) | Recalculable assumptions and cost totals |
| [Local scaffold validation](local-spike.md) | Executable checks, setup and runtime limitations |
| This document | Delivery stages, validation and decisions |

The repository currently contains planning documents. Proposed routes and components are not implemented features. Keep the original version 0.1 PRD intact; material scope changes should receive an explicit PRD revision and linked design changes.

## 3 Implementation stages

| Stage | Reviewable output | Exit criteria |
| --- | --- | --- |
| 1 Feasibility and decisions | Source sample, supported locales, age policy, provider comparison and priced budget | Confirm event geography, fixed costs, permitted source access, auth and durable workflow storage |
| 2 Scaffold and identity | Reproducible pinned setup, migrations, synthetic data and sign-in | Build passes; private record isolation and staging notification sink work |
| 3 Catalogue and review | Public feed, detail pages, source registry and admin revision review | Official evidence, truthful funding labels and date precision pass fixtures |
| 4 Research pipeline | Scheduled discovery, bounded extraction, duplicate handling and budget ledger | Restart recovery, source failure and injection tests pass; no automatic publication during pilot |
| 5 Personalization | Profiles, three language preferences, matching and saved tracker | All FR04–FR06 cases pass, including unknowns and record revisions |
| 6 Notifications | Consent, Telegram binding, email adapter, outbox and reminders | Both channels pass sandbox tests, opt-out cancels queues and ambiguous sends are handled |
| 7 Limited pilot | Reviewed records, delivery metrics, backup restore and feedback | PRD quality targets measured and launch decisions resolved |
| 8 Public release | Production configuration, monitoring and support procedures | Owner authorizes release and complete user flow passes in production |

Do not treat estimates, budget targets or pending provider choices as approved commitments. No implementation or hosting service is created by merging these design documents.

## 4 Validation by change type

Documentation: check relative links, table shape, Mermaid syntax and correspondence with FR01–FR09. Review the full rendered Markdown and PR diff when available.

Application: run formatting, type checking, build and domain tests. Add authorization and adapter integration tests where affected; use synthetic fixtures and notification sinks. Avoid tests that merely restate implementation.

Pipeline: verify one full path from allowed source through evidence, review, matching and queued notification. Inject timeouts, retries, restarts, conflicting source facts and budget exhaustion.

Release: verify browser onboarding, catalogue, save, channel connection, digest, opt-out and deletion end to end. Confirm that a health check alone is not treated as proof the product works.

## 5 Decision register

| ID | Decision | Status and next action |
| --- | --- | --- |
| D01 | Shared collection and catalogue across users | Accepted product direction |
| D02 | Email or Telegram, one active channel in MVP | Defined in PRD; implement channel switch semantics |
| D03 | Scholarships in China; global online programs and China in-person events | Scholarship scope confirmed; program and event geography proposed |
| D04 | Separate interface, alert and teaching languages | Defined design; select supported launch locales |
| D05 | US$30 monthly pilot ceiling | Conditional US$26.07 baseline documented; quotes, extras and owner decision still needed |
| D06 | TypeScript, Node 24+, Next.js, PostgreSQL and eve | Proposed architecture; validate scaffold and persistence |
| D07 | Hosting, identity, search, model and email providers | Candidates researched in provider feasibility; account, region and runtime tests pending |
| D08 | Account age, privacy terms, retention and backup expiry | Open launch prerequisites |
| D09 | Free pilot access and future monetization | Open business decision |
| D10 | Human review of all pilot publications | Required pilot quality control in PRD |

Record the date, evidence and affected documents when a proposal is accepted or changed. A document merge means the design is versioned; it does not resolve every open decision.

## 6 Feasibility checkpoint on 29 October 2026

Provider and source research is documented, with budget arithmetic checked. Stage 1 remains conditional: launch locales, account policy, exact hosting prices, source permission checks and runtime proof are unresolved. The next work is a local scaffold spike with synthetic users and notification sinks to resolve technical feasibility; it does not constitute a passed public-launch gate. No paid subscriptions or infrastructure were created.

## 7 Local scaffold checkpoint on 29 October 2026

Stage 2 has a working local subset: email-link identity, private preferences and saved fixtures, SQL migrations, a notification sink and repeatable web and agent checks. See the local scaffold validation report. PGlite was tested; a real PostgreSQL server and managed provider were not. Settled-session reconnection works in the checkpoint test, while immediate hard-kill recovery had timeouts and remains a deployment blocker. Browser visual validation is also pending. No public-release gate has been waived.

## 8 Catalogue implementation checkpoint on 30 October 2026

Stage 3 has a local implementation of source registration, evidence-backed drafts, administrator review with revision conflicts, public filters/details and saved-record history. The catalogue report records conservative funding, freshness and date-only policies and the remaining scope. The shared catalogue integration test has a PostgreSQL 16 CI case as well as PGlite coverage. Browser validation and precise timestamp handling remain pending. This checkpoint does not waive earlier feasibility decisions or authorize public release.


## 9 Source pipeline checkpoint on 30 October 2026

Stage 4 now includes a local source queue with persisted leases, bounded retrieval, snapshot deduplication, evidence validation and private-draft extraction. The admin dashboard controls source permissions and shows candidate text and job failures. The optional Gateway adapter is gated by explicit configuration and a worst-case budget reservation; no model or paid service has been selected or called. See the source pipeline report for tested behavior and remaining gaps. A live-source/model pilot, general web search, semantic reconciliation, actual-cost reconciliation, recurring worker hosting and arbitrary in-flight eve recovery remain open. Stage 4 and public release are not marked complete.


## 10 Matching and tracker checkpoint on 31 October 2026

Stage 5 has a local implementation of deterministic matching, expanded preferences, source-supported eligibility rules, profile versions and owner-scoped application tracking. Material-fact fingerprints keep cosmetic edits from undoing dismissals. Saved history uses public titles and draft closure cannot bypass publication review. See the matching/tracker report for limits and validation. Full FR04–FR06 acceptance, translation, browser validation and launch privacy decisions remain pending; no public-release gate is waived.


## 11 Notification planning checkpoint on 31 October 2026

Stage 6 has local consent and single-channel settings, timezone-aware daily/weekly digest planning, 10-item overflow, material-event deduplication and transactional local-sink dispatch with current-state checks. Pausing or changing settings cancels pending local digests. The consent version explicitly covers simulation, not future live delivery. See the digest report for validation and boundaries. Verified bindings, provider delivery/webhooks, signed unsubscribe, reminders, quotas, translations, retention/deletion and scheduled hosting remain pending. Stage 6 and public release are not marked complete.


## 12 Telegram binding checkpoint on 31 October 2026

Stage 6 now includes a local Telegram linking protocol with expiring hashed codes, owner confirmation, encrypted destinations, authenticated/deduplicated webhooks and ordered revocation. Disconnect/block handling pauses selected Telegram digests and cancels their queued events. See the Telegram report for tests and deployment boundaries. No bot is registered and no real message is sent. Live verification, providers, consent integration, key lifecycle, retention and launch gates remain pending.


## 13 Email-control checkpoint on 31 October 2026

Stage 6 now includes signed local email unsubscribe capabilities, consent epochs, non-mutating landing pages and POST confirmation. A Resend/Svix-shaped verifier authenticates raw callback bytes, deduplicates events and reconciles early callbacks against trusted digest attempts. Sticky destination suppression stops queued and future local email digests while preserving other channels. See the email-control report for tested behavior and limits. Live sending-domain/DKIM qualification, real provider sending, mailbox interoperability, operational suppression review, key rotation, retention/deletion and public release remain pending.


## 14 Outbound adapter checkpoint on 31 October 2026

Stage 6 has fixture-only email/Telegram request adapters and a separate encrypted simulation queue. The worker freezes idempotency identity, reserves day/month quota atomically, caps known-rejection retries and fences ambiguous/crashed attempts as uncertain. Accepted email correlation can be repaired without another send. See the outbound simulation report for tests and boundaries. No live transport or credentials are enabled; provider qualification, production intents, operational reconciliation, scheduling, retention and release gates remain pending.

## 15 Account privacy checkpoint on 31 October 2026

Local account export and queued deletion now include recent-authentication checks, immediate session/channel revocation, pending-write guards, private receipt lookup and a restartable purge worker. See [account privacy](account-privacy.md) for scope and validation. Shared reviewer attribution needs operator-assisted handling; retention, backups, provider erasure, browser validation and public-release gates remain open. This checkpoint does not authorize deployment.

## 16 Language support checkpoint on 31 October 2026

Stage 5/6 now includes English/Simplified Chinese display selection, navigation and sign-in, plus localized local digest and outbound simulation templates. Display, alert and teaching language choices remain independent. Original source wording and uncertain fees/dates are preserved; unsupported or legacy templates use explicit English fallback. See [language support](language-support.md) for tests, cookie precedence and remaining untranslated screens. Complete interface translation, linguistic/browser review, live delivery and release gates remain open.

## 17 Catalogue and workspace translation checkpoint on 31 October 2026

The English/Simplified Chinese interface now includes catalogue filters/details, private preferences, deterministic match explanations and saved tracker controls. Source facts retain original wording and translated option labels keep stable API values. See [language support](language-support.md) for source-preservation and form-contract checks. Alert settings, privacy screens, remaining service errors, linguistic/browser review and live release gates remain open. No source translation model or paid execution is enabled.

## 18 Alert and privacy translation checkpoint on 31 October 2026

Local user screens now include translated digest consent/schedules, Telegram binding and delivery simulations, privacy export/deletion, public receipt status and standalone unsubscribe pages. Stable action/consent/token values and purge boundaries are preserved. See [language support](language-support.md) for browser-cookie versus machine one-click behavior and validation. Admin translations, full service-error coverage, linguistic/browser review, retention policies, live channels and public release remain open.

## 19 Admin translation checkpoint on 31 October 2026

The local English/Simplified Chinese interface now covers admin catalogue review and source-collection/manual-extraction controls. Review/permission semantics, source evidence, JSON contracts, tri-state costs and audit notes remain unchanged. See [language support](language-support.md) for the seeded extraction-to-review HTTP checks. Remaining service/framework errors, linguistic/browser review, live-source/model validation and all public-release gates remain open.

## 20 Error recovery checkpoint on 2 November 2026

The local application now translates fixed service/API error messages and provides custom English/Simplified Chinese production not-found, page-failure and root-layout fallback screens. Error details remain private and retry is explicit. A static error-message audit and rendered/HTTP checks cover translation gaps, secret-bearing exceptions and missing/restricted records. See [language support](language-support.md) for root-fallback locale behavior and validation boundaries. Third-party interoperability, browser/linguistic review, source/provider pilots and public-release gates remain open.

## 21 Expanded catalogue filters checkpoint on 2 November 2026

The local public catalogue now supports combined topic, study-level, mode, China/unstated-location and date-only deadline facets alongside existing search/type/language/funding filters. Query validation, literal topic matching and pagination preserve filter intent; invalid web filters show a message without broadening results. See [catalogue implementation](catalogue-implementation.md) for scope, UTC date policy and tests. Browser/linguistic validation, broader geographic facets, precise source-timezone deadlines and live-release gates remain open.

## 22 Audit-history checkpoint on 2 November 2026

Administrators now have a read-only bilingual revision-history screen and bounded API with stable revision cursors, stored actor/reason/time, original snapshots and field-level comparisons. Missing/unknown values and missing predecessors are explicit. See [catalogue implementation](catalogue-implementation.md) for access, pagination and validation boundaries. Legacy consumers, source records and publication actions are unchanged. Browser review, audit retention/anonymization policy, admin queue pagination and release gates remain open.

## 23 Admin catalogue navigation checkpoint on 2 November 2026

A searchable, paginated administrator catalogue now reaches records and sources beyond the editor's latest-100 bootstrap. Validated deep links load exact editor targets and retain the selected source through refreshes without changing revision/evidence/publication semantics. See [catalogue implementation](catalogue-implementation.md) for query limits, live-list ordering and validation. Research dashboard pagination, browser review, operational retention/provider validation and public-release gates remain open.

## 24 Research navigation checkpoint on 2 November 2026

Administrators can browse source policies, jobs and candidates in searchable pages of 25 and open exact older policy/review targets beyond the recent workspace limits. Selected records survive policy saves and manual candidate review, preserving original source text and private-draft publication boundaries. See [source pipeline](source-pipeline.md) for query validation, live-list ordering and verification. Browser/linguistic review, job/uncertain-cost recovery controls, retention, live provider/source pilots and public-release gates remain open.


## 25 Collection-job recovery checkpoint on 2 November 2026

Administrators now have a bilingual collection-job detail screen with audited cancellation and one queued replacement per failed/cancelled attempt. Expected state/attempts, ordered locks, active-job checks and lease fencing preserve worker and source-policy behavior. See [source pipeline](source-pipeline.md) for queue semantics, privacy handling and tests. Uncertain model usage, browser/linguistic review, live collection/provider pilots, retention and public-release gates remain open.


## 26 Conditional collection checkpoint on 2 November 2026

Source collection now supports persisted ETag/Last-Modified validators and fenced 304 completion without new candidate extraction or publication verification. URL/snapshot identity, conservative header validation and existing retrieval/lease boundaries remain enforced. See [source pipeline](source-pipeline.md) for protocol scope and database/stream tests. Live-source interoperability and measured bandwidth savings, uncertain model-cost recovery, browser review, retention and public-release gates remain open.


## 27 Retry-After checkpoint on 2 November 2026

Collection now persists per-source Retry-After waits for 429/503 responses, retains them across restart and replacement jobs, and requires source-policy review for excessive waits. Failure completion is fenced by policy/current lease and admin screens expose delay/review state. See [source pipeline](source-pipeline.md) for accepted formats, limits, reset semantics and tests. Host-wide pacing, live-source interoperability, browser review, uncertain model-cost recovery and release gates remain open.


## 28 Read-only hosted staging checkpoint on 2 November 2026

Vercel/Supabase staging preparation introduces an explicit read-only mode, no-request-time migrations, schema-pinned SQL, health checks and an isolated Supabase bootstrap with RLS. Authentication and channels remain disabled in hosted previews, while local fixture flows remain intact. See [staging guide](vercel-supabase-staging.md) for setup and verification. Hosted account access, live collection/alerts, backups/retention and public release remain separate gates.

## 29 Notification commands and tracker merge checkpoint (5 November 2026)

Local one-shot reminder and material-change commands now call the existing persisted jobs, refuse staging before database access and report their local-only outcome. They do not install a schedule or send to providers; change alerts remain queued. Duplicate reconciliation preserves the most recent exact database timestamp, including a later dismissal/removal or status regression, with survivor precedence on equal timestamps. Merge operations advance optimistic versions without manufacturing a new user-choice timestamp. The README separates these implemented portions from remaining source rechecks, hosted scheduling, independently configurable updates and real transport qualification.

## 30 Residence eligibility checkpoint (5 November 2026)

An optional country-of-residence profile/onboarding field and separately reviewed residence-country restrictions extend the existing JSON contracts without database DDL. Missing/legacy data remains valid and unknown; explicit ALL means the source states residence is unrestricted. Nationality is evaluated separately. Matching rules version 2 explains known residence failures and missing facts; material fingerprints normalize residence country-list order. English/Simplified Chinese forms expose the field without collecting addresses. Extraction still requires human review and must not infer residence restrictions from nationality. Live source/model qualification and language-test/qualification-equivalence work remain open.

## 31 Age freshness checkpoint (6 November 2026)

Users can supply an optional birth year instead of age, or explicitly confirm their current self-reported age on a UTC date. Birth year yields a current-year age interval because no birthday is collected. Matching version 3 excludes only ranges wholly outside recorded limits; overlapping intervals, legacy undated ages and confirmations from another UTC day remain needs-checking. Both inputs together and future confirmation dates/years are rejected when saving. English/Simplified Chinese onboarding and profile forms preserve the metadata in existing private JSON records, with no DDL. This is a conservative current-age policy, not identity verification or institution-specific age-at-deadline qualification. Language-test/equivalence work and live-release gates remain open.

## 32 Language-test checkpoint (6 November 2026)

Optional private language-test results and separately reviewed mandatory overall-score requirements extend existing JSON records. A result names the test/version and numeric maximum scale (up to 1,000), overall score, test date and known valid-through date. Matching version 4 compares only normalized-identical names and equal scales with a past/current test date and explicit unexpired UTC-day validity. Missing, future-dated, expired or incompatible evidence remains needs-checking; a compatible current score below the recorded mandatory minimum is a known failure. No score conversion, default expiry, waiver or teaching-language inference is performed.

Shared bilingual fields cover profile, onboarding and admin review; extracted requirements require a quotation from eligibility evidence and human publication review. Blank groups clear the optional value, while partial numeric entries cannot silently become zero. Source cutoffs at future deadlines, alternative exams, section scores, waivers, qualification equivalence and live-provider/source qualification remain open. No database DDL is required.

## 33 Session-management checkpoint (6 November 2026)

A private bilingual active-sign-in screen and owner-scoped API list 20 sessions per page, exclude expired sessions, identify the current session and revoke one selected session after explicit UI confirmation. Viewing/revocation revalidate a current database session and require authentication within ten minutes. The inventory exposes IDs, UTC dates and a bounded browser hint, never session tokens or IP addresses; update dates are not described as last activity. Live pagination is not an activity-history snapshot. Revocation retries for missing/foreign targets return the same unavailable outcome.

Cookie session caching is explicitly disabled; unused Better Auth token-based session-management HTTP paths are disabled in favor of this ID-scoped interface. Self-revocation invalidates the database session and routes to sign-in; the UI also attempts normal cookie cleanup. Tests use real authentication cookies, user isolation, concurrent/idempotent revocation, stale authentication and the PostgreSQL matrix, plus HTTP origin/cache/ownership checks. Existing tables suffice. Verified email changes, broader production security policy and hosted account enablement remain open.

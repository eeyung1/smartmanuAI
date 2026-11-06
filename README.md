# smartmanuAI

A multi-user platform for finding smart manufacturing scholarships to study in China, plus free learning programs and events, with personalized email or Telegram alerts.

The product uses one shared research pipeline and reviewed catalogue for all users. Private profiles drive deterministic matching; source collection and AI extraction are shared so research costs do not grow as one agent per subscriber.

**Current stage: local implementation plus verified protected read-only Vercel staging. Public release is not complete.** Local sign-in accepts synthetic `.test` addresses and notifications use local sinks or injected simulations. The explicit staging mode supports a private Supabase catalogue reader, disables account sign-in and notifications, and never runs migrations at request time. See [Vercel/Supabase staging](docs/vercel-supabase-staging.md) for provisioning and verification status.

Feature audit: **6 November 2026**, through [implementation PR #51](https://github.com/eeyung1/smartmanuAI/pull/51). Staging serves an empty reviewed catalogue; production accounts, scheduled discovery and real notifications remain release work.

## How to read this checklist

- **[x] Implemented:** code or the named planning deliverable exists, with the local/fixture validation described here. A checked adapter or protocol does not mean its external service is connected.
- **[ ] Not completed:** missing implementation, incomplete acceptance, unresolved decision or live/production verification. These remain unchecked even when a local foundation exists.
- **Deferred features** are listed separately at the end; they are outside the current MVP rather than promises for the next release.

The detailed checklist below is the implementation inventory. The [original PRD](docs/smartmanuAI_PRD_v0_1.md) remains the requirements baseline. Older design documents contain proposed routes and historical checkpoint limitations; the route inventory and completion status here describe the current code.

## Contents

- [Product scope and decisions](#product-scope-and-decisions)
- [Detailed feature checklist](#detailed-feature-checklist)
- [PRD requirement coverage](#prd-requirement-coverage)
- [Current screens and APIs](#current-screens-and-apis)
- [Local development](#local-development)
- [Validation and release gates](#validation-and-release-gates)
- [Repository map and documentation](#repository-map-and-documentation)
- [Delivery workflow](#delivery-workflow)
- [Deferred and excluded features](#deferred-and-excluded-features)

## Product scope and decisions

- [x] Define visitor, registered-user and administrator responsibilities.
- [x] Design a shared catalogue/research pipeline with private user records.
- [x] Implement scholarship publication rules restricting study location to China.
- [x] Implement the prototype scope of worldwide online opportunities and China-based in-person opportunities.
- [x] Implement one selected notification channel per user: email or Telegram, in local mode.
- [x] Keep interface language, alert language and acceptable teaching languages independent.
- [x] Record cost-effectiveness assumptions, provider research and a pilot budget worksheet.
- [x] Version the PRD, screen flows, technical architecture and delivery workflow.
- [ ] Obtain final product approval for program/event geography beyond the confirmed China scholarship scope.
- [ ] Approve launch locales, translation-review policy, initial audience size and minimum account age.
- [ ] Approve pilot access pricing, longer-term business model and operating ceiling; US$30/month remains a planning target.
- [ ] Select and qualify production hosting, database/workflow storage, identity, search, model and email services.
- [ ] Confirm the sending domain, operator-owned Telegram bot, administrator ownership and permitted initial official sources.

## Detailed feature checklist

### 1. Identity, private accounts and preferences

- [x] Local email magic-link sign-in, authenticated sessions and sign-out.
- [x] Hashed, ten-minute sign-in tokens with expiry and replay-rejection tests.
- [x] Private local authentication-mail sink restricted to synthetic `.test` recipients.
- [x] Authentication rate limiting and trusted local-origin configuration.
- [x] Separate administrator role checks on admin pages, services and APIs.
- [x] Owner-scoped profile, tracker, notification and connection access; forged ownership fields are rejected.
- [x] Validated profile creation/editing and version increments only when preferences change.
- [x] Nationality, optional age, qualification and target bachelor/master/doctorate level preferences.
- [x] Topic interests, scholarship/course/event categories, funding choices and online/in-person preferences.
- [x] Preferred in-person countries and acceptable English/Chinese teaching languages.
- [x] Independent English/Simplified Chinese interface and alert preferences.
- [x] User-facing settings/profile form in the private `/matches` workspace.
- [x] Dedicated multi-step onboarding with persisted progress, completion checks and contextual guidance.
- [x] Preserve validated internal opportunity/save destinations through sign-in and onboarding; reject external redirect destinations.
- [x] Optional residence-country field in profile settings and persisted onboarding; separately reviewed residence-country eligibility rules with known-failure/unknown handling.
- [x] Optional age-confirmation date or birth year in onboarding/profile settings, with UTC-day freshness and conservative birth-year range checks; legacy undated ages remain unknown.
- [x] Optional self-reported language-test result (name/version, numeric scale, overall score, test date and known validity) in profile/onboarding, separate from teaching-language preferences.
- [ ] Detailed qualification equivalence.
- [ ] Institution-specific age-at-deadline/event rules and timezone qualification.
- [x] Private paginated active-session screen/API with current-session markers, recent-authentication checks, individual revocation and tested cookie invalidation; no session tokens or IP addresses returned by the inventory.
- [ ] Verified account-email change flow and production session/security-policy qualification.
- [ ] Production identity configuration, real authentication email and trusted proxy/rate-limit qualification.
- [ ] Public catalogue/API rate limiting and production security/CSRF policy qualification.
- [ ] Public account-age/minor policy and complete onboarding acceptance tests.

### 2. Public catalogue and opportunity details

- [x] Public opportunity feed, counts, detail pages and 12-item pagination.
- [x] Literal case-insensitive search across title, organizer and summary.
- [x] Combined category, topic, study-level, funding, delivery-mode and teaching-language filters.
- [x] China/unstated-location filters and explicit unknown study-level/language options.
- [x] Date-only deadline filters: next 30 UTC calendar days, dated records or no stated date.
- [x] URL-based filters preserved in pagination; form submission starts at page one.
- [x] Reject duplicate, unknown or invalid query fields; invalid web filters show an explicit empty/error state.
- [x] Default feed excludes partial/unclear funding, expired/closing-today dates and records beyond the seven-day verification window.
- [x] Explicit partial/unclear funding browsing when that filter is selected.
- [x] Hide unpublished records from public pages/APIs; retain labelled closed/stale public details for existing links.
- [x] Show organizer, category, mode, location, teaching language, topics, eligibility and verification time.
- [x] Distinguish fully funded, tuition only, free participation, partial funding and unclear funding.
- [x] Require supported tuition, accommodation and living costs before using the fully-funded label.
- [x] Preserve application fees, certificate fees, travel costs and coverage duration; unknown costs remain unknown.
- [x] Preserve original deadline wording and disclose date/timezone uncertainty.
- [x] Official source link on non-synthetic records; synthetic records are labelled and have no application link.
- [x] Honest empty states and links back to browsing/preferences.
- [ ] Precise source deadline timestamps, source timezones and full rolling-deadline semantics.
- [ ] Broader location facets if the final geographic scope requires them.
- [ ] Last successful shared catalogue-refresh indicator in empty results.
- [x] Private `/matches/explore` browsing beyond profile preferences, with mismatch/unknown-requirement notes on displayed records, unchanged catalogue results and no eligibility guarantee.
- [ ] Verify official-source coverage and field accuracy against a live reviewed opportunity sample.

### 3. Administrator catalogue, evidence and publication

- [x] Register named HTTPS sources with explicit synthetic-fixture marking.
- [x] Manually author private drafts with title, funding, deadline and eligibility evidence.
- [x] Structured nationality, age and minimum-qualification requirements, with unknown values preserved.
- [x] Publish, revise, reject and close through administrator-authorized actions.
- [x] Require evidence/source verification attestation before publication.
- [x] Reject unsupported funding combinations, out-of-scope locations and past/closing-today publication dates.
- [x] Expected-revision conflicts prevent silent overwrites.
- [x] Revisions retain actor, timestamp, reason, state, details and evidence snapshots.
- [x] Revising a published record returns it to draft; unpublished edits cannot leak through saved-item titles.
- [x] Searchable administrator catalogue with source/record views in pages of 25 and state filters.
- [x] Exact editor/source selection beyond the latest-100 bootstrap, retained through saves and refreshes.
- [x] Private read-only audit screen/API with bounded revision cursors and field-level comparisons.
- [x] Explicit distinctions between missing values, nulls, zero costs, type changes and unavailable predecessors.
- [x] English/Simplified Chinese review, browse, editor and audit controls; original evidence/notes stay unchanged.
- [x] Administrator duplicate merge with surviving opportunity identity, archived duplicate and source-URL audit notes.
- [ ] Persistent source aliases and automatic reconciliation across different URLs/intakes.
- [x] Preserve each user's latest tracker status, saved/dismissed choice and exact timestamp when merging duplicates; ties keep the survivor and versions still advance.
- [ ] Explicit intake/event identity reconciliation so new intakes remain distinct.
- [x] Audited archive action for closed/rejected opportunities, hidden from public discovery.
- [ ] Complete discovered/review/stale lifecycle automation and restoration policy.
- [x] Bilingual publication preview of the public card/details with evidence, deadline and policy warnings before approval.
- [x] Per-source collection cadence from 6–168 hours, defaulting to 24, with admin controls, legacy-value preservation and scheduler enforcement.
- [x] Source type/language labels at registration and version-checked admin editing, with explicit unknown defaults and no automatic trust or collection changes.
- [x] Consolidated per-source stored collection-job counts: completed, failed, active and cancelled across retained history, including selected older sources; these are current job states, not attempt or publication-success metrics.
- [x] Read-only admin operations overview for collection queues, review candidates, source policies and exact shared-budget/model-ledger reservations.
- [x] Bounded bulk archiving of closed/rejected records on the current catalogue page, with confirmation, per-record revisions/audit notes and explicit partial/uncertain outcomes.
- [ ] Broader bulk moderation (including publication) and live operations/actual-provider-cost reconciliation.

### 4. Source collection, retrieval and job recovery

- [x] Administrator source-policy enable/pause controls with an operator permission note.
- [x] Refuse live collection of synthetic or `.test` sources.
- [x] Manually invoked scheduler for up to 25 due registered sources, with a one-day interval and one active job per source.
- [x] Durable queued/running/done/failed/cancelled jobs, one-minute leases and unique worker tokens.
- [x] Recover expired claims within the three-attempt cap; fence late results after expiry, reclamation, cancellation or source pause.
- [x] HTTPS-only public URL admission, DNS address validation and pinned requests with hostname TLS verification.
- [x] Block private/special network destinations; send no user cookies or authorization headers; reject all redirects.
- [x] Fifteen-second retrieval deadline, 256,000-byte response cap and supported UTF-8/ASCII HTML/plain-text decoding.
- [x] Strip HTML scripts/styles/markup and normalize untrusted excerpts to at most 10,000 UTF-8 bytes.
- [x] Hash/deduplicate snapshots per source; unchanged content does not create another extraction candidate.
- [x] Persist ETag/Last-Modified metadata bound to the exact source URL and snapshot.
- [x] Conditional requests and bodyless 304 completion; observation time changes without refreshing publication verification.
- [x] Ignore malformed/injected validators; disable reuse for no-store and unsupported Vary responses.
- [x] Persist per-source Retry-After waits for 429/503 responses; scheduler, claims and replacement jobs retain the wait.
- [x] Five-minute fallback and three-attempt cap; waits over seven days require operator source-policy review.
- [x] Fence failure completion so stale workers cannot overwrite a newer outcome or add a new pause.
- [x] Searchable source/job/candidate research browser in pages of 25 with state and exact-source filters.
- [x] Inspect older source policies/candidates beyond the recent 100-source/50-job/25-candidate dashboard windows.
- [x] Exact candidate selection also loads its parent source and survives manual review refreshes.
- [x] Audited cancellation of queued/running jobs and one replacement per failed/cancelled job.
- [x] Preserve original attempts/diagnostics; link predecessor and replacement; reject stale or competing recovery actions.
- [x] Bilingual job detail pages expose availability, Retry-After waits and review-required pauses without lease tokens.
- [ ] Open-web search provider integration and scheduled English/Chinese discovery queries.
- [ ] Candidate-link discovery and official-source admission from search/aggregator leads.
- [ ] Structured feed, PDF, browser-rendered page and additional-encoding adapters.
- [ ] Multiple opportunity extraction from one page and cross-source semantic reconciliation.
- [ ] Host-wide concurrency/pacing and stricter per-source request-delay configuration.
- [ ] Automated access/robots policy checks; current permission review is an operator attestation.
- [ ] Weekly open-record rechecks and daily rechecks within 14 days of closing, rather than one uniform source interval.
- [ ] Automatic source rechecks before reminders and a verified source-to-publication freshness workflow.
- [ ] Recurring hosted collection/discovery workers and an approved-source TLS/DNS/interoperability pilot.

### 5. AI extraction and durable runtime

- [x] Strict structured extraction schema for relevance, opportunity details and evidence/unknown reasons.
- [x] Validate output size, captured-source quotations, supported title, topic relevance, funding evidence and deadline evidence.
- [x] Manual JSON import without a model call; relevant results create only a private draft/revision.
- [x] Record irrelevant candidates as rejected; repeated processing conflicts instead of duplicating drafts.
- [x] Optional AI Gateway extractor behind explicit paid-research enablement, model identifier and worst-case cost reservation.
- [x] Bound captured input, output to 2,000 tokens and calls to 30 seconds, with SDK retries disabled.
- [x] Atomically reserve research budget before an attempt; prevent automatic replay after a reserved/uncertain attempt.
- [x] Keep model extraction separate from publication, private profiles, notification credentials and delivery capability.
- [x] Pinned eve fixture runtime with a fake model, narrow tool allowlist and guarded external-network access.
- [x] Persist and reconnect a settled eve session after a hard process restart.
- [ ] Automatic extraction dispatch, controlled repair workflow and measured provider input-token accounting.
- [ ] Actual-cost settlement, uncertain model-attempt recovery and safe operator retry decisions.
- [ ] Live model qualification: output quality, privacy/data policy, regional access, token/cost bounds and failure behavior.
- [ ] Arbitrary in-flight eve crash recovery, durable hosted workflow storage and version-upgrade compatibility.
- [ ] Semantic evidence/conflict assessment beyond keyword, schema and quotation checks.

### 6. Personalized matches and saved tracker

- [x] Deterministic rules for nationality, source-supported age/qualification restrictions, study level, funding, mode, country and teaching language.
- [x] Exclude known failures; show missing eligibility information as needs checking rather than confirmed eligibility.
- [x] Explain ranking using topic overlap and explicit preference matches, without admission probabilities.
- [x] English/Chinese topic synonym groups for smart/intelligent manufacturing, automation, robotics, industrial AI, digital twins and industrial IoT.
- [x] Recalculate matches on request with profile, rules and opportunity versions.
- [x] Twelve-item match pages over at most 1,000 eligible candidates, with a disclosed truncation flag.
- [x] Save once, remove a save, dismiss and restore, with owner-scoped persistence.
- [x] Interested/applying/applied statuses; applied remains a user-reported status.
- [x] Keep save state, application status and dismissal independent; reject stale tracker versions.
- [x] Material-fact fingerprints prevent cosmetic title/summary edits from resurfacing unchanged dismissed items.
- [x] Relevant material changes can resurface a dismissed record; closed/stale saved history remains available.
- [x] Preserve the last public title when the current record is an unpublished revision.
- [x] Tracker pagination, literal search and status filtering beyond the latest 100 rows.
- [ ] Matching over the full catalogue beyond the 1,000-candidate bound and stronger cross-request snapshot consistency.
- [x] Residence eligibility independent of nationality, including explicit unrestricted residence and missing-profile/source information.
- [x] Source-evidenced single mandatory overall language-test threshold; compare only matching test/version/scale with current dated validity, and explain missing/expired/incompatible evidence.
- [ ] Alternative tests, waivers, section-score combinations, source-specific validity cutoffs and detailed qualification-equivalence rules.
- [ ] Complete FR04–FR06 acceptance against representative real user/source cases.

### 7. Languages, content and interface recovery

- [x] English (`en`) and Simplified Chinese (`zh-Hans`) prototype interface/alert options.
- [x] Browser display selector with HTTP-only cookie, saved-profile fallback and English default.
- [x] Display changes do not overwrite alert or teaching-language preferences.
- [x] Localized navigation, sign-in, catalogue/details, profile, matching and tracker controls.
- [x] Localized alert settings, Telegram tests, simulations, privacy, deletion receipts and browser unsubscribe pages.
- [x] Localized admin catalogue, evidence editor, audit, research browse and job recovery controls.
- [x] Translate controlled alert labels while preserving original source titles, fees, dates, evidence and audit notes.
- [x] Explicit English fallback for unsupported/legacy alert templates and original-wording fallback for dynamic service messages.
- [x] Stable untranslated API/form enum values, consent tokens and structured JSON fields.
- [x] Request-scoped locale selection and language changes that preserve mounted form/receipt state.
- [x] Fixed application-error translation audit and localized generic not-found/page-failure recovery.
- [x] Root-layout failure screen with independent language selection and no exception/secret disclosure.
- [ ] Reviewed translations of opportunity summaries and revision/locale translation cache with invalidation.
- [ ] Additional launch languages, right-to-left layout support and final locale approval.
- [ ] Linguistic review, browser-driven language/retry/state-preservation tests and third-party auth/framework error interoperability.
- [ ] Complete mobile/desktop, keyboard, contrast, focus, screen-reader and offline acceptance review.

### 8. Consent, digest planning and reminders

- [x] Explicit versioned local-sink consent, one selected channel, pause/resume and version-conflict protection.
- [x] Daily 09:00 and weekly Monday 09:00 digests in the selected IANA timezone.
- [x] Persist UTC due times and handle daylight-saving/skipped-date cases in scheduling fixtures.
- [x] Coalesce missed slots, allow one pending digest per user and suppress empty digests.
- [x] Include at most 10 unseen material events; leave overflow unseen for later consideration.
- [x] Deduplicate accepted material events across cosmetic edits, profile versions, channel switches and local retries.
- [x] Require verification within 24 hours and recheck consent, profile, dismissal, publication, deadline, freshness and material facts at local dispatch.
- [x] Cancel queued local digests on settings changes or pause; drop invalid pending events before local acceptance.
- [x] Commit sink insertion and event/digest acceptance together; show the last 20 local digest statuses.
- [x] Localized digest text and preserved funding/fee uncertainty, match reasons, source time and synthetic notices.
- [x] Local seven-day/two-day saved-opportunity reminders with opt-in, 24-hour verification freshness and deadline/revision deduplication; runnable with `npm run reminders:once`.
- [ ] Automatic official-source rechecks before reminders and live delivery qualification.
- [x] Independent reminder opt-in for interested/applying saved items, with a separate default-off option for applied saves.
- [x] User choice to retain local deadline reminders for already-applied saved opportunities, with current consent/pause/preference rechecks.
- [x] Separate default-off local opt-in for saved-item deadline/funding/closure updates outside the digest schedule, with master-pause/channel-change cancellation and no replay after re-enabling.
- [x] Queue local closure, funding reduction and deadline-change alerts for active saved items outside normal discovery funding filters, using `npm run changes:once`.
- [ ] Dispatch queued change alerts with current consent, destination, suppression and privacy rechecks.
- [ ] Production consent version, verified destination/binding integration and real email/Telegram dispatch.
- [x] User-facing preview of fresh, unseen digest content without scheduling or sending.
- [x] Owner-only stored digest history with channel/state filters and timestamp/ID cursor pagination beyond 20 records.
- [ ] Unified paginated history for reminders, material changes and delivery simulations.
- [ ] Continuously scheduled hosted digest/reminder execution and live end-to-end acceptance.

### 9. Telegram connection and revocation

- [x] Local ten-minute, hashed, single-use connection codes, with reissue invalidation and owner cooldown.
- [x] Authenticated bounded webhook parsing and persisted update-ID replay suppression.
- [x] Require a private non-bot sender matching the private chat; reject group and mismatched-sender bindings.
- [x] Pending connection followed by signed-in owner confirmation with expected-version checking.
- [x] AES-256-GCM encrypted chat destination and keyed uniqueness per chat; API returns only safe masked state.
- [x] Disconnect/block handling revokes codes/bindings and suppresses selected Telegram digest work.
- [x] Out-of-order chat-event protection; unblocking does not restore consent automatically.
- [x] Do not silently switch a disconnected Telegram user to email.
- [ ] Register/verify a live operator-owned bot and public HTTPS webhook.
- [ ] Real bot deep-link connection and confirmation against a live Telegram account.
- [ ] Production recent-authentication policy, bot migration/multi-bot handling and encryption-key rotation/recovery.
- [ ] Qualify real blocked/invalid-destination provider responses and live delivery behavior.

### 10. Email unsubscribe and suppression

- [x] Purpose-scoped signed unsubscribe capabilities with hashed nonces, consent epochs, expiry and idempotence.
- [x] Non-mutating GET/HEAD landing; session-free confirmation and supported form-encoded one-click POST.
- [x] Keep opt-out scoped to optional email digests, without pausing Telegram or authentication mail.
- [x] Prevent old consent-epoch links from disabling a later explicit opt-in.
- [x] Raw-body, timestamped Resend/Svix-shaped callback signature verification and event replay suppression.
- [x] Correlate bounces/complaints to trusted provider-message IDs and immutable recipient hashes.
- [x] Retain/reconcile early callbacks and enforce sticky destination suppression; users cannot clear it by toggling settings.
- [x] Recheck suppression in settings, planning and dispatch; cancel affected queued email digests.
- [x] No-store/no-referrer protections and escaped browser unsubscribe responses.
- [ ] Verify a real sender/domain, authenticated mail/DKIM, provider account and public callback endpoint.
- [ ] Complete production RFC 8058/mailbox interoperability, including required headers and multipart POST support.
- [ ] Production suppression-review/support process, key rotation and token redaction in external logs.

### 11. Outbound adapters and delivery simulations

- [x] Email and Telegram request builders behind an injected transport, with no default live network sender.
- [x] Restrict preparation to accepted synthetic local digests, `.test` email recipients and confirmed local Telegram bindings where required.
- [x] Encrypt complete simulation requests/destinations with owner-authenticated encryption.
- [x] Freeze request body and email idempotency identity across retries; prepare once per digest.
- [x] Escaped email HTML/plain text, signed unsubscribe test headers and bounded plain-text Telegram messages.
- [x] Disable Telegram paid broadcasting/previews and reject oversized requests.
- [x] Ready/sending/retry/quota-wait/accepted/failed/suppressed/uncertain simulation states.
- [x] Atomically reserve UTC daily/monthly quotas; rollback partial quota admission and wait for period boundaries.
- [x] Recheck current consent, channel/binding, suppression and opportunity facts before attempting a frozen request.
- [x] Bounded adapter attempts, provider retry hints, timeout classification and one-minute lease fencing.
- [x] Expired/ambiguous sends remain uncertain; do not automatically resend them.
- [x] Repair accepted email-message correlation without another provider call.
- [x] Owner-visible safe simulation history without raw request credentials/destinations.
- [ ] Production transport credentials, HTTPS/redirect/response-size qualification and real channel delivery.
- [ ] Provider-enforced quota/accounting verification, accepted/delivered/failed callback correlation and operator reconciliation controls.
- [ ] Live delivery latency, deliverability, duplicates and opt-out acceptance measurements; provider acceptance never proves read status.

### 12. Account export, deletion and data lifecycle

- [x] Owner-scoped profile/activity JSON export; exclude secrets, raw mail, tokens and encrypted requests.
- [x] Require authentication within ten minutes for export/deletion, with explicit literal `DELETE` confirmation.
- [x] Immediately pause alerts, suppress queued work, revoke connections/sessions and fence new writes when deletion is accepted.
- [x] Persist deletion requests and hashed private receipts; public receipt lookup exposes no account identity.
- [x] Resumable local purge of account-owned SQL data and authentication mail, preserving other users' records.
- [x] Transactional rollback/retry for malformed local mail and pending-deletion reauthentication guards.
- [x] Remove channel/callback correlation while retaining documented minimal suppression markers and anonymous receipt dates.
- [x] Detect shared source/review/job-audit contributions and return an explicit operator-assisted-deletion conflict.
- [ ] Implement operator-assisted reviewer anonymization/deletion rather than only detecting the need for it.
- [ ] Approve/enforce evidence, revision, delivery-log, token, receipt and suppression-marker retention/cleanup policies.
- [ ] Define/test provider erasure, backup expiry, key retirement and deletion service-level monitoring.
- [ ] Verify active-system deletion within the proposed 30-day period in the production service.
- [ ] Publish approved privacy notices, consent terms, jurisdiction/account-age rules and support procedures.

### 13. Cost controls, operations and infrastructure

- [x] Reuse one shared catalogue and deterministic matching; do not send full profiles to research providers.
- [x] Content hashes/conditional retrieval reduce repeated local processing; paid extraction remains explicitly disabled by default.
- [x] Atomic worst-case research reservations with a configured cap and reserved/completed/uncertain attempt records.
- [x] Explicit simulation day/month quotas independent of assumed provider free tiers.
- [x] PostgreSQL-compatible migrations and embedded PGlite for single-process local development.
- [x] PostgreSQL 16 integration matrix in CI, using isolated schemas and concurrent-claim/restart fixtures.
- [x] Local-only configuration guards, generated private development settings and labelled synthetic seeds.
- [x] Pinned dependencies, lockfile, format/type/build checks and GitHub Actions validation.
- [x] Read-only Vercel staging configuration, health endpoint and explicit disabled-account/channel UI.
- [x] Additive private-schema bootstrap with RLS and a least-privilege catalogue reader, tested locally and in the PostgreSQL CI case.
- [x] Verified protected Vercel staging with HTTP 200 health/database connection, catalogue and sign-in pages on 6 November 2026; 39 RLS tables and 21 migrations in the shared l2e-studylink project.
- [ ] Full production/managed database validation, private-account database roles and development/staging/production separation.
- [ ] Approve exact current hosting/search/model/email/backup prices and capacity before provisioning.
- [ ] Monthly research budget periods, actual-cost/invoice reconciliation and provider spend overview.
- [ ] Budget alerts at 70%, optional-work reduction at 90%, and production hard-cap/reserved essential capacity behavior.
- [x] Read-only workload-age indicators for queued records and pending candidates, stored-gate readiness, expired leases and scheduled-due sources, with exact UTC age semantics.
- [ ] Live source-success, actual execution-duration, quota and delivery telemetry with secret/token redaction.
- [ ] Alert administrators after two consecutive failed runs and show last successful shared refresh.
- [ ] Measure the proposed 99% scheduled-run success target and feed p95 below two seconds under an agreed load.
- [ ] Production backups, restore drill, migration/worker-upgrade procedure and rollback validation.
- [ ] Durable hosted workflow storage, recurring workers, health/incident monitoring and operational support ownership.
- [x] Protected read-only staging at https://smartmanuai.vercel.app with a dedicated reader and verified TLS.
- [ ] Authorized public pilot/production release with account access, live research and notifications.

## PRD requirement coverage

A checked subfeature above does not mark an entire public-MVP requirement accepted. All nine requirements still need the combined production/browser acceptance applicable to their scope.

| Requirement           | Implemented foundation                                                        | Remaining acceptance/work                                                                    |
| --------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| FR01 Private profiles | Local sign-in, persisted onboarding, isolated preferences, export and queued account purge | Additional profile fields, reviewer-deletion operations and production identity/privacy |
| FR02 Discovery        | Combined public filters, URL state, counts and pagination                     | Live-source coverage, browser/navigation acceptance and any approved broader location scope  |
| FR03 Details          | Evidence, funding breakdown, source links, conservative dates and freshness   | Live field-quality review and precise source deadline/timezone handling                      |
| FR04 Personalization  | Known-failure exclusion, explicit unknowns and deterministic explanations     | Complex language-test/qualification-equivalence rules and representative real-case acceptance            |
| FR05 Tracking         | Paginated/searchable save/status/dismiss/restore and latest-choice duplicate reconciliation          | Full browser acceptance and larger-catalogue matching consistency  |
| FR06 Languages        | Independent preferences and English/Chinese controlled interface/alert text   | Reviewed source translations, final launch locales and linguistic/browser acceptance         |
| FR07 Alerts           | Local consent, digests/previews, runnable reminders and queued change alerts          | Source rechecks, update-alert controls/dispatch, verified live channels and hosted scheduling                  |
| FR08 Administration   | Evidence/publication preview, duplicate merge/archive, audited corrections and job recovery       | Automatic identity reconciliation, full source metadata, operations/cost views and live operations    |
| FR09 User control     | Local pause, Telegram revoke, signed email opt-out and queued deletion        | Live-provider interoperability, reviewer deletion and production retention/backup policy     |

## Current screens and APIs

These are implemented routes, not the separate routes proposed in the original screen-flow document. Profile editing, personalized matches and the saved tracker currently share `/matches`.

| Screen                                      | Purpose                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `/`, `/opportunities`                       | Public catalogue and filters                                                      |
| `/opportunities/[id]`                       | Public details and save action                                                    |
| `/account/sessions` | Private active-sign-in inventory and revocation (recent authentication required) |
| `/sign-in`                                  | Local magic-link sign-in                                                          |
| `/onboarding` | Resumable profile/preferences wizard with validated return destination |
| `/matches/explore` | Private catalogue browsing with saved-profile comparison notes |
| `/matches`                                  | Private preferences, matches and saved/dismissed tracker                          |
| `/notifications/history` | Private paginated digest history with channel/state filters |
| `/notifications`                            | Local digest settings, Telegram links, unsubscribe tests and delivery simulations |
| `/privacy`, `/privacy/status`               | Export/deletion request and private receipt status                                |
| `/unsubscribe?token=...`                    | Scoped email opt-out confirmation                                                 |
| `/admin/catalogue`                          | Paginated source/opportunity browser                                              |
| `/admin/review`                             | Source registration, draft and revision editor                                    |
| `/admin/review/[id]/history`                | Private revision audit comparisons                                                |
| `/admin/operations` | Private read-only queue, source-policy and budget-reservation summary |
| `/admin/research`, `/admin/research/browse` | Collection policies, candidates and paginated research records                    |
| `/admin/research/jobs/[id]`                 | Job detail, cancellation, replacement links and wait/review state                 |

API groups: `/api/auth/*`; public `/api/opportunities*`; owner-only `/api/me/sessions`, `/api/me/onboarding`, `/api/me/notifications/preview`, `/api/me/notifications/history`, `/api/me/profile`, `/api/me/matches`, `/api/me/saved`, `/api/me/tracker`, `/api/me/notifications`, `/api/me/telegram`, `/api/me/email-unsubscribe`, `/api/me/delivery-tests` and `/api/me/privacy/*`; private-receipt `/api/privacy/status`; scoped `/api/notifications/unsubscribe`; authenticated `/api/webhooks/email` and `/api/webhooks/telegram`; and administrator `/api/admin/operations`, `/api/admin/sources`, `/api/admin/opportunities*`, `/api/admin/catalogue` and `/api/admin/research*`. `/api/locale` updates the browser display choice. Method-specific contracts and authorization remain in the route handlers and linked implementation guides.

## Local development

### Setup

Requires **Node.js 24**. Dependencies are pinned in [package.json](package.json) and [package-lock.json](package-lock.json). No cloud accounts or provider credentials are required for local validation.

```sh
npm ci
npm run setup:local
npm run db:migrate
npm run seed:local # optional, explicitly labelled synthetic catalogue
npm run dev
```

Open `http://127.0.0.1:3000`. Sign in with a synthetic `.test` email and open its link from the private `.local/mail.jsonl` sink. Local setup creates missing private settings without printing secrets or replacing existing values. Retain local encryption keys if keeping existing encrypted test data.

PGlite permits **one owning process**. Stop the development server before migrations, seeds, admin grants or worker commands. Optional local PostgreSQL supports separate processes; local-mode configuration rejects remote/managed database URLs. The separate read-only staging mode is documented in the staging guide; it is not a production account/worker deployment recipe.

### Administrator access

Sign in first, stop the server when using PGlite, then run:

```sh
npm run admin:grant -- your-name@example.test
```

Restart and visit `/admin/review`, `/admin/catalogue` or `/admin/research`. Role grants are a local operator command; there is no public role-grant endpoint.

### Commands

| Command                                                     | Behavior                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                               | Loopback Next.js development server                                                                               |
| `npm run build` / `npm start`                               | Production-mode build/local server; does not deploy                                                               |
| `npm run setup:local`                                       | Generate/add missing local-only configuration                                                                     |
| `npm run db:migrate` / `npm run seed:local`                 | Apply migrations / seed optional synthetic catalogue                                                              |
| `npm run reminders:once` | Run due saved-item reminders into the local sink; hosted mode is refused |
| `npm run changes:once` | Queue deduplicated material-change alerts locally; no external dispatch |
| `npm run digest:once`                                       | Plan one due user and dispatch one queued local-sink digest                                                       |
| `npm run delivery:test:once`                                | Process a synthetic outbound simulation with injected transport                                                   |
| `npm run privacy:once`                                      | Process at most one queued local account purge                                                                    |
| `npm run research:once`                                     | Schedule due sources and process one collection job; live retrieval requires explicit enablement                  |
| `npm run research:once -- extract ADMIN_EMAIL CANDIDATE_ID` | Optional paid extraction contract; requires reviewed model, credentials, cost reservation and explicit enablement |
| `npm run agent:build` / `npm run spike`                     | Build/check the bounded fixture agent with its local network guard                                                |
| `npm run check`                                             | Format, typecheck, tests, web build, HTTP checks, guarded agent build and restart spike                           |

Consult [source pipeline](docs/source-pipeline.md) before enabling collection or optional model execution. Reminder commands write the local sink and change-alert commands only queue outbox records; they refuse staging and do not send to providers. Worker commands do not install recurring schedules. Do not use real subscriber destinations in local tests.

## Validation and release gates

The latest application baseline, [PR #24](https://github.com/eeyung1/smartmanuAI/pull/24), passed **61 tests with zero failures/skips in PostgreSQL 16 CI**, plus production build, HTTP checks, guarded agent build and restart spike. Locally, without `TEST_DATABASE_URL`, 46 tests passed and 15 PostgreSQL cases were explicitly skipped. Test counts are a dated baseline, not a promise that every PRD acceptance criterion is complete.

```sh
npm run check
```

Set `TEST_DATABASE_URL` to an expendable local PostgreSQL database to include the PostgreSQL test cases locally. The matrix creates isolated schemas; do not point tests at subscriber or production data.

- [x] Domain/integration coverage for catalogue truth, authorization, matching/tracker, consent, channels, suppression and privacy.
- [x] Collection/recovery coverage for leases, restarts, deduplication, validators, Retry-After, uncertain extraction and budgets.
- [x] Simulation coverage for immutable requests, quotas, opt-out, ambiguous results and binding changes.
- [x] Production HTTP checks for session isolation, bilingual rendered content, filters, admin review and recovery, opt-out and privacy.
- [x] Guarded fixture-agent tool/schema checks and settled-session restart continuation.
- [ ] Browser-driven full journeys on mobile/desktop, keyboard and assistive technology, including offline/interrupted flows.
- [ ] Live permitted-source/model and verified email/Telegram interoperability pilots.
- [ ] Managed-database, hosted in-flight recovery, backup/restore and load testing.
- [ ] Review at least 50 published opportunities, or all if fewer: target 95% funding/deadline accuracy and 100% official-source coverage.
- [ ] Measure no known expired records in new alerts and at least 80% relevant matches in pilot feedback.
- [ ] Demonstrate production digest/reminder deduplication, source rechecks, opt-out and deletion end to end.
- [ ] Resolve product/privacy/budget/provider decisions and obtain authorization for public release.

## Repository map and documentation

### Implemented stack

| Component                   | Current implementation                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Web and API                 | Next.js, React and TypeScript on Node.js 24                                                                       |
| Local identity              | Better Auth magic links with Drizzle database integration                                                         |
| Application data and queues | PostgreSQL-compatible SQL; embedded PGlite locally, PostgreSQL 16 in CI                                           |
| Research                    | Deterministic collection/retrieval services, optional AI SDK/Gateway extraction and a bounded eve fixture runtime |
| Channel controls            | Native cryptography, local sinks and injected email/Telegram simulation adapters                                  |
| Validation                  | Node test runner/tsx, Prettier, TypeScript, production HTTP checks and GitHub Actions                             |

Exact installed versions are recorded in the package manifest and lockfile. A library/provider adapter in this stack is not a connected production service.

### Source layout

| Location                                      | Current responsibility                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `app/`                                        | Next.js pages, API routes and user/admin controls                                     |
| `src/auth/`, `src/http/`, `src/config.ts`     | Local identity, access checks and configuration boundaries                            |
| `src/catalogue/`, `src/domain/`               | Evidence/revisions, browsing, matching, private preferences and tracking              |
| `src/research/`                               | Collection, safe retrieval, validators, extraction, research browsing and job actions |
| `src/jobs/`, `src/channels/`, `src/delivery/` | Local queues/digests, channel controls and outbound simulations                       |
| `src/privacy/`, `src/i18n/`                   | Export/deletion and controlled interface/template translations                        |
| `src/db/`, `db/migrations/`                   | PGlite/PostgreSQL access, auth schema and versioned SQL migrations                    |
| `agent/`, `scripts/`, `tests/`                | Bounded eve fixture, operator/validation commands and automated coverage              |
| `.github/workflows/`                          | Pull-request and main-branch CI                                                       |
| `docs/`                                       | Requirements, proposals, implementation checkpoints, limits and decisions             |

| Document                                                                                          | What it covers                                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Product requirements](docs/smartmanuAI_PRD_v0_1.md)                                              | FR01–FR09, product scope and public-MVP acceptance                            |
| [Screen flows](docs/screen-flows.md)                                                              | Proposed journeys and screen acceptance                                       |
| [Technical architecture](docs/technical-architecture.md)                                          | Proposed components, data and trust boundaries                                |
| [Delivery workflow](docs/delivery-workflow.md)                                                    | Required workflow, decisions and dated implementation checkpoints             |
| [Provider feasibility](docs/provider-feasibility.md) / [budget worksheet](docs/pilot-budget.json) | Historical provider research and unapproved cost assumptions                  |
| [Source feasibility](docs/source-feasibility.md)                                                  | Official-page sample and source-access limitations                            |
| [Local scaffold](docs/local-spike.md)                                                             | Local setup, fixture runtime and recovery limits                              |
| [Catalogue](docs/catalogue-implementation.md)                                                     | Publication, public/admin browse and audit-history behavior                   |
| [Source pipeline](docs/source-pipeline.md)                                                        | Collection, extraction, job recovery, conditional retrieval and Retry-After   |
| [Matching and tracker](docs/matching-tracker.md)                                                  | Rule policy, material changes, persistence and bounds                         |
| [Local digests](docs/notification-digests.md)                                                     | Consent, timezone slots, caps and sink semantics                              |
| [Telegram](docs/telegram-linking.md)                                                              | Local link ownership, encrypted bindings and revocation                       |
| [Email controls](docs/email-controls.md)                                                          | Signed opt-out, verified callbacks and suppression                            |
| [Outbound simulation](docs/outbound-simulation.md)                                                | Request adapters, quota/retry/uncertainty semantics                           |
| [Account privacy](docs/account-privacy.md)                                                        | Local export, deletion receipts, purge and remaining policy work              |
| [Vercel/Supabase staging](docs/vercel-supabase-staging.md)                                        | Read-only hosting, private schema, roles, secrets and deployment verification |
| [Language support](docs/language-support.md)                                                      | English/Chinese controls, original wording, fallback and validation limits    |

## Delivery workflow

1. Read the PRD, relevant implementation guides and repository instructions; inspect current `main`.
2. Create a focused branch from current `main`.
3. Implement a complete reviewable slice and update this checklist accurately.
4. Validate the change and inspect the diff. Documentation changes require content/links/requirement coverage checks; application changes require the appropriate automated suite.
5. Open a PR with behavior, validation and remaining limits.
6. Wait for required CI/review checks and inspect results; do not bypass protections or blocking reviews.
7. Merge within the authorized task scope, fetch and verify clean `main`.
8. Report the PR and concrete result. A merge is not a live deployment or a waiver of release gates.

When implementation is partial, keep its completed subfeatures checked and its remaining subfeatures unchecked. Do not tick a live connection, operational policy, quality target or complete PRD requirement solely because a fixture or foundation exists.

## Deferred and excluded features

These remain unimplemented and are outside the current MVP unless scope is explicitly revised.

- [ ] Additional alert channels beyond email and Telegram.
- [ ] Native mobile applications.
- [ ] User-submitted opportunity listings.
- [ ] Broad global scholarship coverage beyond China study opportunities.
- [ ] Payments or paid subscriptions.
- [ ] Automatic application submission or contacting universities on users' behalf.
- [ ] Applicant document/passport/transcript/banking uploads or collection of exact addresses.

The product does not guarantee eligibility, admission, funding, internet completeness or inbox/read delivery. Source evidence and human publication review remain essential.

# smartmanuAI Product Requirements

Version 0.1  |  29 October 2026  |  Planning for the first release

### Product purpose

smartmanuAI will help users discover funded study opportunities in China and free learning programs and events related to smart manufacturing. Users create their own profiles, select languages, and receive personalized alerts by email or Telegram.

The first release should collect and verify opportunities centrally, then match the shared catalogue to many users. This keeps research costs from increasing directly with every new account and gives administrators one place to correct information.

### Confirmed requirements

- The product is for multiple users who choose to use it, rather than one personal assistant.
- Users choose their languages. Email and Telegram are the supported alert channels.
- Cost effectiveness is a primary design constraint.
- The project remains in planning. This document does not authorize deployment or start scheduled notifications.

### Proposed scope

Scholarships cover study in China. Programs and events cover online opportunities worldwide and in-person opportunities in China. This geographic scope for programs and events is a proposal to confirm before implementation.

### Goals and boundaries

Help users find relevant opportunities early, understand actual funding and eligibility, and reach official application pages. The product will not guarantee eligibility, admission, funding, completeness of internet coverage, or successful delivery to a user’s inbox.

The MVP will not submit applications, collect application documents, contact universities for users, sell applicant data, or include payments and paid subscriptions. Whether platform access remains free is a separate business decision.

## 1 Users and core journeys

### User roles

Visitors can browse published opportunities. Registered users maintain private profiles, save opportunities and opt into notifications. Administrators manage sources, review uncertain records, correct information and monitor collection and delivery jobs.

### Onboarding

A user registers through verified email access, chooses an interface and alert language, and supplies nationality, residence country, highest qualification, target study levels, subject interests and acceptable teaching languages. They choose funding preferences, online or in-person participation, timezone and digest frequency. Optional eligibility details can be added later.

Age or birth year should be optional and requested only when useful for eligibility. Do not collect passports, transcripts, banking details or exact addresses in the MVP. Account eligibility and any rules for minors must be settled before public launch.

### Find and manage an opportunity

The user sees matching opportunities with a reason for each match and any missing eligibility information. They can search and filter, open details, visit the official application link, save or dismiss an item, and mark it as interested, applying or applied. Applied is a user-reported status; the platform does not verify submission.

### Connect notifications

Users explicitly opt into email or connect Telegram with a short-lived, single-use account link. Telegram connection must require the user to initiate interaction with the bot. The MVP supports one selected active channel per user; users can switch or pause at any time.

### When no opportunity matches

Show an honest empty state with the last successful catalogue update, suggestions to widen filters and a way to edit preferences. Do not substitute unrelated, expired or paid opportunities to fill the screen.

### Screens in the MVP

- Public opportunity feed and opportunity detail page.
- Registration, sign-in and preference setup.
- Personalized feed and saved opportunity tracker.
- Language, notification, privacy and account settings.
- Admin source list, review queue, opportunity editor, job history and cost overview.

## 2 Functional requirements

| ID | Requirement and acceptance condition |
| --- | --- |
| FR01 | Private profiles: users can create, edit and delete their own profile. User A cannot access User B’s preferences, saved items or channel credentials. |
| FR02 | Discovery: filters include type, topic, study level, funding, location, delivery mode, teaching language and deadline. Filter state is reflected in results. |
| FR03 | Details: every published item shows official source, funding breakdown, eligibility, deadline status and last verification time. Missing facts display as not stated. |
| FR04 | Personalization: known disqualifying rules exclude an item from default matches. Uncertain eligibility appears as needs checking, with an explanation. |
| FR05 | Tracking: saving, dismissing and changing application status persists across sessions. Dismissed records do not return as new matches without a material change. |
| FR06 | Languages: users select supported interface and alert languages separately from teaching languages. Original source text remains accessible; fallback is disclosed. |
| FR07 | Alerts: opted-in users receive daily or weekly digests in their selected channel and timezone. No empty digest is sent by default. |
| FR08 | Administration: administrators can approve, reject, merge, correct, archive and pause sources. Every publication and manual correction has an audit record. |
| FR09 | Control: users can pause alerts, unlink Telegram, unsubscribe from email and request account deletion without contacting support. |

### Release priorities

All requirements above are required for a public MVP. Limited pilot users may be invited before all source automation is ready, using administrator-reviewed records. Additional alert channels, automatic applications, mobile apps, user-submitted listings, payments and broad global scholarships are deferred.

### Language rollout

English is the proposed fallback language. The exact launch language list remains open. Language selection must show only supported languages; do not promise universal interface translation. Build the content structure for additional languages, locale-aware dates and future right-to-left layouts.

## 3 Opportunity quality and discovery

### Source strategy

Maintain a curated source registry of official university admissions pages, scholarship providers, research institutions and event organizers. Search engines and aggregators may discover candidates, but publication requires an official supporting source. Search both English and Chinese terminology, with topic synonyms for intelligent manufacturing, automation, robotics, industrial AI, digital twins and industrial IoT.

### Collection workflow

A scheduled job searches or checks due sources, downloads permitted public pages, extracts structured fields, validates facts against evidence, resolves duplicates and creates or updates a record. Low-confidence, conflicting or incomplete critical claims enter the admin review queue. Begin with human review of all records during the pilot.

Use structured feeds and ordinary page retrieval first. Browser automation is a fallback for necessary public pages. Respect access restrictions and source rate limits; do not bypass logins or anti-bot controls. A failed retrieval records an error and retry time, rather than marking the opportunity closed.

### Funding rules

| Label | Required interpretation |
| --- | --- |
| Fully funded | Officially supported coverage of tuition, accommodation and living costs; list insurance, travel and other benefits separately. Record any shortfall or condition. |
| Tuition only | Tuition is covered; living, travel and other costs are separate or not stated. |
| Free participation | No participation fee. Travel, accommodation, materials and certificate charges must be shown separately. |
| Partial funding | Some costs remain payable. Hidden by default for users seeking free opportunities unless they opt in. |
| Unclear | Coverage is not established. Exclude from default free-opportunity alerts until clarified. |

### Freshness and duplicate control

Identify an opportunity by organizer, title, intake or event dates and canonical source. Keep distinct intakes separate. Store the source content hash and revision history. A corrected title alone must not create a new opportunity or alert.

Proposed cadence: daily discovery, weekly checks of open records, and daily checks within 14 days of a deadline. Reverify within 24 hours before the first alert. After seven days without a successful required check, flag the record as stale and suppress new alerts until checked.

## 4 Matching and notifications

### Match rules

Apply deterministic checks to nationality, study level, location, teaching language, funding and participation mode. Evaluate age, qualifications and language tests only when both source requirements and user details exist. A missing field is unknown, never proof of eligibility or ineligibility.

Rank remaining records by explicit topic overlap, target level, funding preference and deadline proximity. AI may classify descriptions and explain evidence; it must not override hard eligibility restrictions or invent a probability of admission. Users may optionally browse records outside their profile with mismatch labels.

### Digest and reminder rules

- Default proposal: one daily digest at 09:00 in the user’s selected timezone; weekly is also available.
- Include at most 10 new or materially updated matches, with a link to remaining results. Do not send repeated unchanged records.
- For saved opportunities, offer deadline reminders at 7 days and 2 days before closing. Recheck the source before sending.
- A changed deadline or funding withdrawal can generate one update alert outside the digest for affected saved items. Keep these alerts separately configurable.
- If a deadline has already passed, suppress application reminders. If time or timezone is unstated, show that uncertainty and do not invent an exact closing time.

### Reliable delivery

Queue deliveries with a stable deduplication key containing user, opportunity revision, alert type and channel. Separate queued, attempted, provider-accepted, failed and suppressed states. Provider acceptance is not proof that the user read a message. Retry transient failures with backoff, cap attempts and expose persistent failures to administrators.

Check consent and channel status again at send time, including after a queued message is retried. Email bounces and complaints suppress further sends. Telegram blocks or invalid destinations disconnect the channel. Unsubscribing must cancel pending optional messages. Do not silently switch to a channel the user has not enabled.

### Example alert content

Illustrative template, not a real opportunity: opportunity title; institution or organizer; study level or event type; country or online; teaching language; funding and remaining costs; eligibility and unknowns; deadline and source timezone; reason for match; last checked; official application link; notification settings link.

## 5 Data and service design

Use a shared opportunity catalogue with private user records. A small web application, persistent database, scheduled collection worker and notification queue are sufficient logical components for the MVP. Hosting, database, AI, search and email providers remain implementation decisions; no existing project database or workspace is assumed.

| Record | Main fields and relationships |
| --- | --- |
| User and profile | Account ID, verified email, locale, nationality, residence, qualification, target levels, topics, teaching languages, timezone and optional eligibility fields. |
| Notification preference | User ID, channel, protected destination, verification status, consent timestamp, frequency, reminder choices and pause state. |
| Source | Official domain, source URL, source type, language, retrieval policy, cadence, last success, failure count and next check. |
| Opportunity | Stable ID, organizer, category, topics, intake, location, delivery mode, study level, teaching language, funding components and publication state. |
| Evidence and revision | Opportunity ID, source URL, retrieved time, field evidence excerpts, content hash, deadline value and precision, change summary, reviewer and version. |
| Translation | Opportunity revision, language, translated summary, model or translation version and review state. Invalidate after source changes. |
| Saved item and match | User ID, opportunity ID, tracker status, dismissal state, match explanation, eligibility unknowns and matching rules version. |
| Job and delivery | Job ID, run state, attempts, cost and errors; delivery ID, user, channel, revision, deduplication key, timestamps and provider response. |
| Audit event | Actor, action, target ID, timestamp and before or after references for admin changes and consent updates. |

### Lifecycle and isolation

Opportunity states are discovered, review required, published, stale, closed, rejected and archived. Only published records meeting freshness and funding rules can enter normal alerts. Admin changes invalidate affected translations and matching results.

Enforce user ownership in the data access layer and database where supported. Keep service credentials and channel tokens server-side. Store useful evidence excerpts rather than entire sites indefinitely; preserve the official link and retrieval timestamp.

## 6 Cost controls and operational quality

### Cost strategy

Search and extract centrally, reuse each verified record across users, and cache each translation by source revision and language. Content hashes prevent repeated AI extraction. Do not send full user profiles to search providers or run one research agent per user. Limit source count, queries, page size, extraction retries and output tokens.

### Illustrative workload rather than vendor pricing

For a pilot with 100 registered users, assume 30 active sources, 20 discovery queries per day, 10 changed pages requiring extraction per day and 10 new records per week translated into two additional languages. If every user receives one daily digest, the maximum is approximately 3,000 digest deliveries per 30-day month, before reminders and account messages. Actual usage may be lower.

These assumptions imply about 600 searches, 300 extractions and 87 translated summaries per month. Matching should mainly use database filters. Monthly cost equals hosting and database costs plus search usage, retrieval, AI tokens, email volume and operational overhead. No current vendor prices or free-tier allowances are assumed.

Proposed pilot spending ceiling: US$30 per month, subject to provider quotations and owner approval. This is a planning target, not an operating-cost forecast. Alert at 70 percent of the approved budget, reduce optional discovery at 90 percent and stop nonessential paid AI and search work at the ceiling. Preserve account access, opt-out processing and delivery of already verified records within reserved capacity.

### Operational requirements

- Mobile-friendly pages, keyboard navigation, readable contrast and accessible forms. Target core feed response below 2 seconds at the 95th percentile under an agreed pilot load.
- Target 99 percent successful scheduled runs per rolling month, excluding paused jobs. Display last successful refresh and alert administrators after two consecutive failed runs.
- Use bounded retries, job locks and restart-safe checkpoints. Track queue age and expose failures without revealing credentials or private user content.
- Treat fetched pages as untrusted data. Page text must not issue instructions to the agent, access secrets or trigger notifications directly. Validate URLs and block private-network retrieval.
- Document backups and test restoration before public release. Proposed retention: delivery logs 90 days, evidence revisions 180 days and aggregate metrics thereafter.
- Process account deletion from active systems within 30 days and document backup expiry. Confirm jurisdiction, privacy notice, consent terms and retention policy before launch.

## 7 Validation and delivery plan

### Acceptance tests before public release

- A nationality restriction excludes a known ineligible profile; missing nationality produces an unknown result rather than a confirmed match.
- A tuition-only award never appears as fully funded. A free event with paid travel shows the remaining cost.
- Two URLs for the same intake produce one record; a new intake produces a distinct record.
- A failed source check does not close a record. An expired or stale record cannot generate a new standard alert.
- A source correction updates the record, invalidates translations and sends at most one relevant change notification.
- Changing the alert language changes the digest; changing teaching languages changes matches. Unsupported locales receive an explicit fallback.
- A retried job does not create duplicate application-level deliveries. Opt-out suppresses queued messages. Telegram links cannot attach to another user’s account.
- Users cannot read another account’s records; administrators are authorized separately. The monthly budget control works when a simulated limit is reached.

### Pilot success measures

Evaluate a manually reviewed sample of at least 50 published opportunities, or all records if fewer exist. Target at least 95 percent accuracy for deadline and funding fields, 100 percent official-source coverage, and no known expired items in new alerts. Test notification deduplication through retries and restarts. Target at least 80 percent relevant matches in feedback from participating pilot users. These are proposed release gates, not measured results.

### Delivery sequence

Phase 1: confirm scope, launch languages, budget, account policy and initial source registry. Produce screen flows and technical design. Phase 2: implement accounts, catalogue, admin review and manual publishing. Phase 3: add scheduled discovery, evidence extraction, matching and cost tracking. Phase 4: integrate email and Telegram, consent, digest queues and reminders. Phase 5: run a limited pilot, correct quality problems and validate release gates. Estimate dates only after source-access and provider feasibility checks.

### Decisions still to confirm

- Whether to retain worldwide online programs plus China-based in-person events.
- Which interface and alert languages to launch, and whether translations require manual review.
- The monthly operating ceiling and expected initial user count.
- Whether access is free during the pilot, the longer-term business model and any minimum account age.
- Provider selection, email sending domain, administrator ownership and the first official sources to monitor.

Next deliverable: user screen flows and an implementation architecture derived from this PRD. Public deployment and recurring searches begin only during the implementation stage.

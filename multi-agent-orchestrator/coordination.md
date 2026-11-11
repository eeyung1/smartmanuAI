# Coordination

## Project Context
Project: smartmanuAI
Enrolled: NATIVE
Authority: ORCHESTRATOR
Current Milestone: Milestone 3 — Administrative Review & Opportunity Moderation

## Standing Permissions
- Autonomous task claims for unblocked items in `## Feature Backlog`.
- Local execution of tests via `npm test` and `npm run typecheck` within isolated worktrees under `.agent-worktrees/`.
- Local commit on feature branches without `Co-authored-by:` trailers.

## Owner Decisions
- **2026-11-04**: Human operator authorized prioritizing Milestone 1 (Application Flow & Usability). Decomposed into 3 concurrent bounded tasks with non-overlapping file scopes:
  1. `feature-auth-destination-preservation` (Sign-in destination & save action return)
  2. `feature-tracker-pagination-filtering` (Server-side tracker pagination, search & status filters)
  3. `feature-multistep-onboarding` (Dedicated 3-step onboarding wizard at `/onboarding`)
- **2026-11-04**: ORCHESTRATOR reconciled `milestone-1-application-flow` and adopted `feature-auth-destination-preservation` into structured `state.json`. Task ownership confirmed for session `opencode-gpt56sol-20261104-a7f31c-20261104-9d771583` under claim token `auth-destination-20261104-a7f31c-9d2e`.
- **2026-11-04**: Planner merged PR #27 (`feat/auth-destination-preservation`) into `main` (merge commit `6623e3418d2a7abd06b736b8719141745032a195`) following verified GitHub Actions CI run (`local-spike` success). Worktree deleted and task 1 marked `Done`. Reconciled task 2 claim for session `opencode-gpt56sol-20261104-b84e2d-20261104-51548fe4`.
- **2026-11-04**: Planner merged PR #28 (`feat/tracker-pagination-filtering`) into `main` (merge commit `2869e47b50420b14b1675ca98a87035f9fe75164`) following verified GitHub Actions CI run (`local-spike` success). Worktree deleted and task 2 marked `Done`. Reconciled task 3 claim `claim-60f5df30c798cd4c2d4368f65532d854` for worker session `codex-gpt6-20261104-20261104-57bdf9bc`.
- **2026-11-04**: Owner approved Option 2 (scope expansion) for Task 3 (`feature-multistep-onboarding`) to include `db/migrations/` for a dedicated onboarding progress table migration. Structured state updated to generation 11. Worker `codex-gpt6-20261104-20261104-57bdf9bc` authorized to create migrations under `db/migrations/`.
- **2026-11-04**: Planner merged PR #29 (`feat/multistep-onboarding`) into `main` (merge commit `12640e9c1cb91ff7d286c37321face87265510ba`) following verified GitHub Actions CI run (`local-spike` success, 72/72 tests pass). Worktree deleted and task 3 marked `Done`. Reconciled in `state.json` (generation 13). Milestone 1 (Application Flow & Usability) is 100% COMPLETE.
- **2026-11-04**: Human operator authorized Milestone 2 (Proactive Notifications & Lifecycle Alerts). Decomposed into 3 concurrent bounded tasks with non-overlapping file scopes:
  4. `feature-deadline-reminders` (7-day and 2-day urgent deadline reminders for tracker items)
  5. `feature-opportunity-withdrawal-alerts` (Material change/cancellation alert detection and outbox queueing)
  6. `feature-notification-settings-preview` (Granular notification checkboxes & in-browser digest preview)
Structured authority reconciled in `state.json` (generation 15) and `plan.json`. Tasks open for autonomous worker claims.
- **2026-11-04**: ORCHESTRATOR reconciled Milestone 2 task statuses in `state.json` to `PENDING` to enable automated structured claim via `--acquire-next`. Blocker cleared.
- **2026-11-04**: Planner merged PR #30 (`feat/deadline-reminders`) into `main` (merge commit `169426fe6607246c6bdb6adb45b1f44ed120667e`) following verified GitHub Actions CI run (`local-spike` success, 73/73 tests pass). Worktree deleted and task 4 marked `Done`. Reconciled in `state.json` (generation 23). Task 5 (`feature-opportunity-withdrawal-alerts`) acquired and underway in worker session `codex-gpt6-20261104-next-97c13e-20261104-954c27d4`.
- **2026-11-04**: Planner merged PR #31 (`feat/opportunity-withdrawal-alerts`) into `main` (merge commit `b4f3da9b71937e6cdcd7f1e476caf29fe618dc3f`) following verified GitHub Actions CI run (`local-spike` success). Worktree deleted and task 5 marked `Done`. Reconciled in `state.json` (generation 28). Primary checkout on `main` synchronized.
- **2026-11-04**: Owner/Planner approved scope expansion for Task 6 (`feature-notification-settings-preview`) to include `app/api/me/notifications/route.ts`, `src/jobs/digests.ts`, `src/jobs/deadline-reminders.ts`, `db/migrations/`, `db/staging/bootstrap.sql`, `tests/staging.test.ts`, and `tests/deadline-reminders.test.ts`. This authorizes worker `codex-gpt6-20261104-next2-b7560a-20261104-802c783b` to add a migration for deadline reminder preference, update persistence routes, verify schema staging, and enforce separate reminder preferences. Structured state updated to generation 29. Worktree branch fast-forwarded to `b4f3da9b71937e6cdcd7f1e476caf29fe618dc3f`.
- **2026-11-04**: Owner/Planner approved additional scope expansion for Task 6 (`feature-notification-settings-preview`) to include `src/privacy/account.ts` and `tests/privacy.test.ts`. Structured state updated to generation 30.
- **2026-11-04**: Planner merged PR #32 (`feat/notification-settings-preview`) into `main` (merge commit `73d16b16e37308b1f3a6dbb52cc11e4acbd59b26`) following verified GitHub Actions CI run (`local-spike` success). Worktree deleted and task 6 marked `Done`. Reconciled in `state.json` (generation 32). Milestone 2 (Proactive Notifications & Lifecycle Alerts) is 100% COMPLETE!
- **2026-11-04**: Human operator authorized Milestone 3 (Administrative Review & Opportunity Moderation). Decomposed into 3 concurrent bounded tasks with strictly non-overlapping file scopes:
  7. `feature-admin-publication-preview` (Live user-facing opportunity card & detail view preview with policy warnings in `/admin/review`)
  8. `feature-opportunity-lifecycle-archive` (Lifecycle state machine extension for `archived`, review action `archive`, audit history, and catalogue filtering)
  9. `feature-opportunity-duplicate-merge` (Admin duplicate merge service & endpoint repointing saved tracker items with status progression preservation)
Structured authority reconciled in `state.json` (generation 33) and `plan.json`. All 3 tasks initialized with `PENDING` status for immediate worker claims.
- **2026-11-04**: Planner merged PR #33 (`feat/opportunity-lifecycle-archive`) into `main` (merge commit `c0b4a2205ad307d259c6427e157dcb3d3cab0f7e`) following verified GitHub Actions CI run (`local-spike` success). Worktree deleted and task 8 marked `Done`. Reconciled in `state.json` (generation 37). Migration 015 (`015_opportunity_archive.sql`) is now on `main`, unblocking Task 9 (`feature-opportunity-duplicate-merge`). Primary checkout on `main` synchronized.

- **2026-11-04**: Planner merged PR #34 (`feat/opportunity-duplicate-merge`) into `main` (merge commit `e0d4401a0949d206ba9d156fc2381075b1cb6c10`) following verified GitHub Actions CI run (`local-spike` success, 75/75 tests pass). Worktree deleted and task 9 marked `Done`. Reconciled in `state.json` (generation 41). Task 7 (`feature-admin-publication-preview`) blocker cleared and status reset to `PENDING` for autonomous worker claims. Primary checkout on `main` synchronized.

- **2026-11-04**: Planner merged PR #35 (`feat/admin-publication-preview`) into `main` (merge commit `3eda3983e10be006b06965ddcede5690fa9254e7`) following verified GitHub Actions CI run (`local-spike` success, 76/76 tests pass). Worktree deleted and task 7 marked `Done`. Reconciled in `state.json` (generation 44). Milestone 3 (Administrative Review & Opportunity Moderation) is 100% COMPLETE! Primary checkout on `main` synchronized.
- **2026-11-10**: Planner merged PR #70 (`feat/json-feed-source-adapter`) into `main` (merge commit `f3b623db0eadedc724aab6345ceb527f0236fd56`) following verified GitHub Actions CI run (`local-spike` success, 77/77 tests pass). JSON Feed source adapter integrated. Primary checkout on `main` synchronized.

## Blockers and Proposed Decisions
- None. Milestone 1, Milestone 2, and Milestone 3 are 100% complete and fully merged into `main`.

## Automated Actions
- Continuous publication pipeline complete for Milestone 3. All 9 tasks across Milestones 1, 2, and 3 are integrated, tested, and green in CI.

## Milestone 4 Formulation & Decomposition — 2026-11-10T13:42:00Z
- Human operator authorized Milestone 4 ("Source Pipeline Freshness and Access Control").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  10. `feature-source-refresh-indicator`: Shared source-refresh tracking service and UI indicator (`src/research/refresh-tracker.ts`, `app/admin/operations/summary.tsx`, `tests/refresh-tracker.test.ts`). **MERGED** via PR #71 (`1e8a6d6457db938e7dbc4decaa7274111533babf`).
  11. `feature-source-robots-policy`: Automated robots.txt access policy parser and validator (`src/research/robots-policy.ts`, `tests/robots-policy.test.ts`). **MERGED** via PR #72 (`69f18fc1c3926d1ba91e30cb9cf0d2644e7b6bd8`).
  12. `feature-reminder-source-recheck`: Pre-reminder official source freshness verification workflow (`src/jobs/reminder-recheck.ts`, `src/jobs/deadline-reminders.ts`, `tests/reminder-recheck.test.ts`). **MERGED** via PR #73 (`9e9b55cfa0d16bc6724b609e39d8fc8958236a69`).
- Structured authority reconciled in `state.json` and `plan.json`.

## Milestone 4 Publication Progress
- **2026-11-10 14:54 UTC**: Planner merged PR #71 (`feat/source-refresh-indicator`) into `main` (merge commit `1e8a6d6457db938e7dbc4decaa7274111533babf`) following verified GitHub Actions CI run (`local-spike` green, 78/78 tests pass). Worktree deleted, Task 10 marked Complete.
- **2026-11-10 15:02 UTC**: Planner merged PR #72 (`feat/source-robots-policy`) into `main` (merge commit `69f18fc1c3926d1ba91e30cb9cf0d2644e7b6bd8`) following verified GitHub Actions CI run (`local-spike` green, 78/78 tests pass). Worktree deleted, Task 11 marked Complete.
- **2026-11-10 15:27 UTC**: Planner merged PR #73 (`feat/reminder-source-recheck`) into `main` (merge commit `9e9b55cfa0d16bc6724b609e39d8fc8958236a69`) following verified GitHub Actions CI run (`local-spike` green, 78/78 tests pass). Worktree deleted, Task 12 marked Complete.
- **2026-11-10 15:28 UTC**: Milestone 4 review package approved (`decision: APPROVED`). Milestone 4 is 100% COMPLETE! Primary checkout on `main` synchronized.

## Milestone 5 Formulation & Decomposition — 2026-11-10T15:43:00Z
- Human operator authorized Milestone 5 ("Candidate Discovery, Host Pacing and Language Scoring").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  13. `feature-source-rss-adapter`: RSS 2.0 and Atom XML source feed adapter for official admissions and scholarship feed collection within bounded payload limits (`src/research/rss-feed.ts`, `tests/rss-feed.test.ts`). **MERGED** via PR #74 (`0cf7b767056de226a68d5e27cdd8c6def4b87fb3`).
  14. `feature-host-rate-limiter`: Coordinated host-wide collection rate limiter and pacing service to track per-host request intervals and prevent bursts (`src/research/host-pacer.ts`, `tests/host-pacer.test.ts`). **MERGED** via PR #75 (`8efb94fb9268e47a9de985376569d3bb3474cda8`).
  15. `feature-language-score-matching`: Deterministic language proficiency score evaluation and qualification matching service for applicant profiles (IELTS, TOEFL, HSK) (`src/domain/language-scoring.ts`, `tests/language-scoring.test.ts`). **MERGED** via PR #76 (`3cbddecbdfe8a252dd6e648908c2723d407407f5`).
- Structured authority reconciled in `state.json` and `plan.json`.

## Milestone 5 Publication Progress
- **2026-11-10 18:27 UTC**: Planner merged PR #74 (`feat/source-rss-adapter`) into `main` (merge commit `0cf7b767056de226a68d5e27cdd8c6def4b87fb3`) following verified GitHub Actions CI run (`local-spike` green, 78/78 tests pass). Worktree deleted, Task 13 marked Complete.
- **2026-11-10 18:34 UTC**: Planner merged PR #75 (`feat/host-rate-limiter`) into `main` (merge commit `8efb94fb9268e47a9de985376569d3bb3474cda8`) following verified GitHub Actions CI run (`local-spike` green, 78/78 tests pass). Worktree deleted, Task 14 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-10 18:45 UTC**: Planner merged PR #76 (`feat/language-score-matching`) into `main` (merge commit `3cbddecbdfe8a252dd6e648908c2723d407407f5`) following verified GitHub Actions CI run (`local-spike` green, 78/78 tests pass). Worktree deleted, Task 15 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-10 18:46 UTC**: Planner completed formal objective review for Milestone 5 (`milestone-5-discovery-pacing-scoring`) with decision `APPROVED` (Gen 74). Milestone 5 is 100% COMPLETE.

## Milestone 6 Formulation & Decomposition — 2026-11-10T18:55:00Z
- Human operator authorized Milestone 6 ("Candidate Extraction, Deadline Semantics and Reviewer Anonymization").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  16. `feature-candidate-link-extractor`: Automated candidate link discovery and URL extractor for official university admissions and scholarship directory/listing HTML pages (`src/research/candidate-extractor.ts`, `tests/candidate-extractor.test.ts`). **MERGED** via PR #77 (`497848bf64ddea92f73a6323cd3833c24388805b`).
  17. `feature-deadline-semantics`: Precise deadline semantics, timezone parsing, and rolling admission status evaluation for opportunities (`src/domain/deadline-semantics.ts`, `tests/deadline-semantics.test.ts`). **MERGED** via PR #78 (`a6c5553db80d8e8a3c323bb68215cd6bf15be3ea`).
  18. `feature-reviewer-anonymization`: Operator-assisted reviewer account anonymization service to enable GDPR/privacy deletion compliance for administrator accounts (`src/privacy/operator-anonymization.ts`, `tests/operator-anonymization.test.ts`). **MERGED** via PR #79 (`ccb5d64a2411e5cd6cfaafd5c6ed2574407bae26`).
- Structured authority reconciled in `state.json` (Gen 75) and `plan.json`. Backlog open for worker acquisition via `orchestrator --acquire-next`.

## Milestone 6 Publication Progress
- **2026-11-10 19:11 UTC**: Planner merged PR #77 (`feat/candidate-link-extractor`) into `main` (merge commit `497848bf64ddea92f73a6323cd3833c24388805b`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 16 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-10 19:22 UTC**: Planner merged PR #78 (`feat/deadline-semantics`) into `main` (merge commit `a6c5553db80d8e8a3c323bb68215cd6bf15be3ea`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 17 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-10 19:40 UTC**: Planner merged PR #79 (`feat/reviewer-anonymization`) into `main` (merge commit `ccb5d64a2411e5cd6cfaafd5c6ed2574407bae26`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 18 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-10 19:40 UTC**: Planner completed formal objective review for Milestone 6 (`milestone-6-extraction-deadlines-anonymization`) with decision `APPROVED` (Gen 88). Milestone 6 is 100% COMPLETE & APPROVED. Primary checkout on `main` synchronized.

## Milestone 7 Formulation & Decomposition — 2026-11-10T19:50:00Z
- Human operator authorized Milestone 7 ("Discovery Queries, Multi-Opportunity Extraction and Data Retention Sweeper").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  19. `feature-search-query-generator`: Automated bilingual (EN/ZH) scholarship discovery query generator for target academic institutions, degree tiers, and disciplines (`src/research/discovery-queries.ts`, `tests/discovery-queries.test.ts`). **MERGED** via PR #80 (`e1a69faa3cfac373ea96b5f82103d93919a56fb3`).
  20. `feature-multi-opportunity-extractor`: Multi-opportunity listing and table parser for aggregated directory and listing HTML pages (`src/research/multi-extractor.ts`, `tests/multi-extractor.test.ts`). **MERGED** via PR #81 (`5a2fc787e397f01845a8193f41a917fe9119b0fc`).
  21. `feature-data-retention-sweeper`: Automated data lifecycle retention sweeper to enforce GDPR and operational storage retention policies (FR09) (`src/privacy/retention-sweeper.ts`, `tests/retention-sweeper.test.ts`). **MERGED** via PR #82 (`2c4a2bb21299389d924eaab69a7d615d4754c0b6`).
- Structured authority reconciled in `state.json` (Gen 89) and `plan.json`. Backlog open for worker acquisition via `orchestrator --acquire-next`.

## Milestone 7 Publication Progress
- **2026-11-10 20:05 UTC**: Planner merged PR #80 (`feat/search-query-generator`) into `main` (merge commit `e1a69faa3cfac373ea96b5f82103d93919a56fb3`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 19 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-10 20:10 UTC**: Planner merged PR #81 (`feat/multi-opportunity-extractor`) into `main` (merge commit `5a2fc787e397f01845a8193f41a917fe9119b0fc`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 20 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-10 20:36 UTC**: Planner merged PR #82 (`feat/data-retention-sweeper`) into `main` (merge commit `2c4a2bb21299389d924eaab69a7d615d4754c0b6`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 21 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-10 20:36 UTC**: Planner completed formal objective review for Milestone 7 (`milestone-7-discovery-multi-retention`) with decision `APPROVED` (Gen 102). Milestone 7 is 100% COMPLETE & APPROVED. Primary checkout on `main` synchronized.

## Milestone 8 Formulation & Decomposition — 2026-11-11T08:35:00Z
- Human operator authorized Milestone 8 ("Spending Controls, Mismatch Explanations and Hosted Cron Runner").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  22. `feature-operations-spending-meter`: Monthly operational spending meter, token usage accounting, and spend threshold alerts (70% warning, 90% throttle, 100% hard ceiling against US$30/mo budget) (`src/admin/spending-meter.ts`, `tests/spending-meter.test.ts`). **MERGED** via PR #84 (`2189c0a5ed812b9ef0eae773103bc3f41fd8e777`).
  23. `feature-catalogue-mismatch-explainer`: Deliberate catalogue mismatch explanation service to evaluate why an opportunity outside a user's match set does not match their saved profile (`src/domain/mismatch-explainer.ts`, `tests/mismatch-explainer.test.ts`). **MERGED** via PR #83 (`a313655137ee30bc2c1b0fa02f472abf1a2c14b2`).
  24. `feature-cron-scheduler-runner`: Hosted background cron runner adapter to coordinate and execute scheduled recurring tasks (digests, deadline reminders, retention sweep) with authorized job keys and execution audit logs (`src/jobs/cron-runner.ts`, `tests/cron-runner.test.ts`). **MERGED** via PR #85 (`cafcb971aa20ca98a8003fd9bf0325dc560aa936`).
- Structured authority reconciled in `state.json` (Gen 118) and `plan.json`. Backlog open for worker acquisition via `orchestrator --acquire-next`.

## Milestone 8 Publication Progress
- **2026-11-11 08:55 UTC**: Planner merged PR #83 (`feat/catalogue-mismatch-explainer`) into `main` (merge commit `a313655137ee30bc2c1b0fa02f472abf1a2c14b2`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 23 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 09:41 UTC**: Planner merged PR #84 (`feat/operations-spending-meter`) into `main` (merge commit `2189c0a5ed812b9ef0eae773103bc3f41fd8e777`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 22 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 10:23 UTC**: Planner merged PR #85 (`feat/cron-scheduler-runner`) into `main` (merge commit `cafcb971aa20ca98a8003fd9bf0325dc560aa936`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 24 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 10:26 UTC**: Planner completed formal objective review for Milestone 8 (`milestone-8-spending-mismatch-cron`) with decision `APPROVED` (Gen 118). Milestone 8 is 100% COMPLETE & APPROVED. Primary checkout on `main` synchronized.

## Milestone 9 Formulation & Decomposition — 2026-11-11T10:35:00Z
- Human operator authorized Milestone 9 ("Offering Lineage, Host Cooldowns and Deadline-Aware Scheduling").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  25. `feature-intake-reconciliation-service`: Intake identity reconciliation service to distinguish recurring scholarship/program intakes, recognize edition equivalence, identify ambiguous labels, and generate canonical offering keys (`src/catalogue/intake-reconciler.ts`, `tests/intake-reconciler.test.ts`). **MERGED** via PR #86 (`a01d647f3601ea8b9b563d63fcea8495d2b25667`).
  26. `feature-host-cooldown-coordinator`: Host collection lease and cooldown coordinator to prevent crawler flooding, enforce exponential backoff on consecutive failures, evaluate availability, and manage bounded leases (`src/research/host-cooldown.ts`, `tests/host-cooldown-coordinator.test.ts`). **MERGED** via PR #87 (`0048ccf06c87c21dd218ee9d8172f7327b96451d`).
  27. `feature-deadline-schedule-calculator`: Dynamic deadline-aware collection and recheck schedule calculator to compute next collection timestamps based on application deadlines, urgency horizons, and source verification requirements (`src/jobs/deadline-schedule.ts`, `tests/deadline-schedule.test.ts`). **MERGED** via PR #88 (`b4603bb542c2dcad025245998a27f78b20d19065`).
- Structured authority reconciled in `state.json` (Gen 132) and `plan.json`. Backlog open for worker acquisition via `orchestrator --acquire-next`.

## Milestone 9 Publication Progress
- **2026-11-11 11:10 UTC**: Planner merged PR #86 (`feat/intake-reconciliation-service`) into `main` (merge commit `a01d647f3601ea8b9b563d63fcea8495d2b25667`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 25 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 11:20 UTC**: Planner merged PR #87 (`feat/host-cooldown-coordinator`) into `main` (merge commit `0048ccf06c87c21dd218ee9d8172f7327b96451d`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 26 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 11:41 UTC**: Planner merged PR #88 (`feat/deadline-schedule-calculator`) into `main` (merge commit `b4603bb542c2dcad025245998a27f78b20d19065`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 27 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 11:42 UTC**: Planner completed formal objective review for Milestone 9 (`milestone-9-lineage-cooldown-schedule`) with decision `APPROVED` (Gen 132). Milestone 9 is 100% COMPLETE & APPROVED. Primary checkout on `main` synchronized.

## Milestone 10 Formulation & Decomposition — 2026-11-11T12:05:00Z
- Human operator authorized Milestone 10 ("Outbound Delivery Intent Queue, Email Change Verification and Extraction Dispatching").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  28. `feature-delivery-intent-queue`: Outbound delivery intent queue to manage notification lifecycles (PENDING, DISPATCHING, DELIVERED, FAILED, SUPPRESSED, DEAD_LETTER), retry backoff, channel failure isolation, and deduplication (`src/delivery/intent-queue.ts`, `tests/delivery-intent.test.ts`). **MERGED** via PR #89 (`fda65c2f420aeaf1a445f773f5aeaac64839e65b`).
  29. `feature-verified-email-change`: Verified account email change service coordinating cryptographic verification tokens, expiration windows, rate-limiting, and collision prevention (`src/auth/email-change.ts`, `tests/email-change.test.ts`). **MERGED** via PR #90 (`eb29e2fa64142b311b1f8bd017e3fe3ffcd95db8`).
  30. `feature-extraction-dispatch-coordinator`: Automatic extraction dispatch coordinator evaluating harvested source snapshots, operational spending caps, schema validation, and duplicate prevention (`src/research/extraction-dispatcher.ts`, `tests/extraction-dispatcher.test.ts`). **MERGED** via PR #91 (`3f063c6d925a0d1e909d6b72a40ca6bbbc329cbf`).
- Structured authority reconciled in `state.json` (Gen 133) and `plan.json`. Backlog open for worker acquisition via `orchestrator --acquire-next`.

## Milestone 10 Publication Progress
- **2026-11-11 12:20 UTC**: Planner merged PR #89 (`feat/delivery-intent-queue`) into `main` (merge commit `fda65c2f420aeaf1a445f773f5aeaac64839e65b`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 28 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 12:28 UTC**: Planner merged PR #90 (`feat/verified-email-change`) into `main` (merge commit `eb29e2fa64142b311b1f8bd017e3fe3ffcd95db8`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 29 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 12:55 UTC**: Planner merged PR #91 (`feat/extraction-dispatch-coordinator`) into `main` (merge commit `3f063c6d925a0d1e909d6b72a40ca6bbbc329cbf`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 30 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 12:56 UTC**: Planner completed formal objective review for Milestone 10 (`milestone-10-delivery-intent-and-dispatch`) with decision `APPROVED` (Gen 146). Milestone 10 is 100% COMPLETE & APPROVED. Primary checkout on `main` synchronized.

## Milestone 11 Formulation & Decomposition — 2026-11-11T13:08:00Z
- Human operator authorized Milestone 11 ("Actual-Cost Settlement, Opportunity Translation Caching and Outbound Delivery Dispatching").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  31. `feature-actual-cost-settlement`: Operational actual-cost token settlement and monthly budget rollover coordinator (`src/admin/cost-settlement.ts`, `tests/cost-settlement.test.ts`). **MERGED** via PR #92 (`87efe1dec8171c066ddbb3280c519a5d6dc0abe4`).
  32. `feature-opportunity-translation-cache`: Reviewed opportunity translation caching and content revision invalidation manager (`src/i18n/translation-cache.ts`, `tests/translation-cache.test.ts`). **MERGED** via PR #93 (`acacd812c9d04a262e4854216447ded1600e338e`).
  33. `feature-delivery-transport-dispatcher`: Live outbound delivery transport dispatcher binding leased delivery intents to transport adapters (`src/delivery/transport-dispatcher.ts`, `tests/transport-dispatcher.test.ts`). **MERGED** via PR #94 (`5a8a94f7f06504661317f984e71b97efa9f13556`).
- Structured authority reconciled in `state.json` (Gen 160) and `plan.json`. Backlog open for worker acquisition via `orchestrator --acquire-next`.

## Milestone 11 Publication Progress
- **2026-11-11 13:19 UTC**: Planner merged PR #92 (`feat/actual-cost-settlement`) into `main` (merge commit `87efe1dec8171c066ddbb3280c519a5d6dc0abe4`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 31 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 13:35 UTC**: Planner merged PR #93 (`feat/opportunity-translation-cache`) into `main` (merge commit `acacd812c9d04a262e4854216447ded1600e338e`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 32 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 13:43 UTC**: Planner merged PR #94 (`feat/delivery-transport-dispatcher`) into `main` (merge commit `5a8a94f7f06504661317f984e71b97efa9f13556`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 33 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 13:43 UTC**: Planner completed formal objective review for Milestone 11 (`milestone-11-cost-settlement-translation-transport`) with decision `APPROVED` (Gen 160). Milestone 11 is 100% COMPLETE & APPROVED. Primary checkout on `main` synchronized.


## Milestone 12 Formulation & Decomposition — 2026-11-11T13:59:00Z
- Human operator authorized Milestone 12 ("Delivery Circuit Breaker, XML Sitemap Parser and Qualification Equivalence").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  34. `feature-delivery-circuit-breaker`: Outbound delivery circuit breaker and dead-letter queue (DLQ) policy manager to track consecutive delivery provider failures per channel, manage circuit state transitions (CLOSED, OPEN, HALF_OPEN), and handle DLQ routing/replay (`src/delivery/circuit-breaker.ts`, `tests/delivery-circuit-breaker.test.ts`). **MERGED** via PR #95 (`6452e4059073bba88a32299b3ecc90f767525ae2`).
  35. `feature-research-sitemap-parser`: Automated XML sitemap parser and admission page discoverer supporting sitemaps.org XML protocol, nested sitemap indexes, change frequency weighting, and domain restriction guards (`src/research/sitemap-parser.ts`, `tests/sitemap-parser.test.ts`). **MERGED** via PR #96 (`59ea134e23a85e935ad495f38e43e262414f9643`).
  36. `feature-qualification-equivalence-evaluator`: International academic qualification and degree level equivalence evaluator standardizing diverse global credentials, scoring field-of-study relevance, and evaluating degree eligibility criteria (`src/domain/qualification-equivalence.ts`, `tests/qualification-equivalence.test.ts`). **MERGED** via PR #97 (`a3f87b905c7856769de16ccd29a3f05c9372fbfe`).
- Structured authority reconciled in `state.json` (Gen 174) and `plan.json`. Backlog open for worker acquisition via `orchestrator --acquire-next`.

## Milestone 12 Publication Progress
- **2026-11-11 14:15 UTC**: Planner merged PR #95 (`feat/delivery-circuit-breaker`) into `main` (merge commit `6452e4059073bba88a32299b3ecc90f767525ae2`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 34 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 14:21 UTC**: Planner merged PR #96 (`feat/research-sitemap-parser`) into `main` (merge commit `59ea134e23a85e935ad495f38e43e262414f9643`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 35 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 14:33 UTC**: Planner merged PR #97 (`feat/qualification-equivalence-evaluator`) into `main` (merge commit `a3f87b905c7856769de16ccd29a3f05c9372fbfe`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 36 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 14:34 UTC**: Planner completed formal objective review for Milestone 12 (`milestone-12-circuit-breaker-sitemap-qualifications`) with decision `APPROVED` (Gen 174). Milestone 12 is 100% COMPLETE & APPROVED. Primary checkout on `main` synchronized.

## Milestone 13 Formulation & Decomposition — 2026-11-11T14:56:00Z
- Human operator authorized Milestone 13 ("Residence Eligibility, Operations Metrics Aggregator and Brochure Section Parser").
- Decomposed into 3 concurrent bounded tasks with strictly disjoint file scopes:
  37. `feature-residence-eligibility-evaluator`: Applicant residence country eligibility evaluator to evaluate applicant country of residence against opportunity geographic eligibility constraints (`src/domain/residence-eligibility.ts`, `tests/residence-eligibility.test.ts`). **MERGED** via PR #98 (`8efec91513ce838f32ec4319c73f9dfe8353713e`).
  38. `feature-operations-metrics-aggregator`: Unified operational health metrics aggregator to synthesize system health across research jobs, outbound delivery queues, monthly spending vs budget caps, and system SLAs into dashboard indicators (`src/admin/operations-aggregator.ts`, `tests/operations-aggregator.test.ts`). **MERGED** via PR #99 (`3e025570e31d537231eb534799d7619919e8bc16`).
  39. `feature-research-brochure-parser`: Multi-format admissions brochure and guideline parser to parse structured text and markdown admissions guides, extracting funding packages, eligibility requirements, application steps, and timeline milestones (`src/research/brochure-parser.ts`, `tests/brochure-parser.test.ts`). **MERGED** via PR #100 (`628cf709704e302e065451a93d565a0120edc6fb`).
- Structured authority reconciled in `state.json` (Gen 188) and `plan.json`. Backlog open for worker acquisition via `orchestrator --acquire-next`.

## Milestone 13 Publication Progress
- **2026-11-11 15:28 UTC**: Planner merged PR #98 (`feat/residence-eligibility-evaluator`) into `main` (merge commit `8efec91513ce838f32ec4319c73f9dfe8353713e`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 37 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 15:38 UTC**: Planner merged PR #99 (`feat/operations-metrics-aggregator`) into `main` (merge commit `3e025570e31d537231eb534799d7619919e8bc16`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 38 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 15:46 UTC**: Planner merged PR #100 (`feat/research-brochure-parser`) into `main` (merge commit `628cf709704e302e065451a93d565a0120edc6fb`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 39 marked Complete. Primary checkout on `main` synchronized.
- **2026-11-11 15:47 UTC**: Planner completed formal objective review for Milestone 13 (`milestone-13-residence-operations-brochure`) with decision `APPROVED` (Gen 188). Milestone 13 is 100% COMPLETE & APPROVED. Primary checkout on `main` synchronized.

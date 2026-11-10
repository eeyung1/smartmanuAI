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
  17. `feature-deadline-semantics`: Precise deadline semantics, timezone parsing, and rolling admission status evaluation for opportunities (`src/domain/deadline-semantics.ts`, `tests/deadline-semantics.test.ts`). Status: **PENDING**.
  18. `feature-reviewer-anonymization`: Operator-assisted reviewer account anonymization service to enable GDPR/privacy deletion compliance for administrator accounts (`src/privacy/operator-anonymization.ts`, `tests/operator-anonymization.test.ts`). Status: **PENDING**.
- Structured authority reconciled in `state.json` (Gen 75) and `plan.json`. Backlog open for worker acquisition via `orchestrator --acquire-next`.

## Milestone 6 Publication Progress
- **2026-11-10 19:11 UTC**: Planner merged PR #77 (`feat/candidate-link-extractor`) into `main` (merge commit `497848bf64ddea92f73a6323cd3833c24388805b`) following verified GitHub Actions CI run (`local-spike` green, all unit tests, typecheck and format check pass). Worktree deleted, Task 16 marked Complete. Primary checkout on `main` synchronized.

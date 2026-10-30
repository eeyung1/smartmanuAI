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

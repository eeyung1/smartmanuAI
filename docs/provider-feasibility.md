# Provider Feasibility and Pilot Budget

Version 0.1 | Checked 29 October 2026 | Planning evidence and conditional recommendation

References: [PRD](smartmanuAI_PRD_v0_1.md), [Architecture](technical-architecture.md), [Source assessment](source-feasibility.md), [Budget worksheet](pilot-budget.json).

## 1 Result and recommended next step

A small pilot appears possible near the proposed US$30 monthly target, but the fully hosted configuration is not yet validated. Proceed next with a local scaffold and runtime spike using synthetic users and notification sinks. Do not provision paid services or open public registration on the strength of this estimate.

Recommended candidates for the spike:

- Next.js and TypeScript for the web application, with Better Auth email magic links and PostgreSQL.
- eve for bounded research, with an explicitly selected just-bash environment and all model-accessible shell, file, unrestricted network and delegation tools disabled.
- Render as the first hosting candidate: a web service, a separate single-instance research service and managed PostgreSQL.
- Brave Search API for shared discovery and GPT-4.1 mini through AI Gateway as the extraction and translation benchmark.
- Resend for email, plus ordinary Telegram Bot API messages without paid broadcasting.
- A pilot of up to 100 accounts, with no more than 50 daily email digest subscribers under the initial free email allocation.

These are recommendations, not purchased services or accepted product constraints. Launch language choices, account policy and budget remain owner decisions. Chinese and English source discovery is independent of the languages eventually offered in the interface.

## 2 Provider evidence and tradeoffs

| Capability | Candidate and verified evidence | Consequence for smartmanuAI |
| --- | --- | --- |
| Hosting | [Render plans](https://render.com/docs/compute-plans) list 512 MB web and private service plans; [pricing](https://render.com/pricing) separates workspace and compute | Start with a priced two-service candidate; benchmark memory before committing |
| Workflow persistence | [eve self-hosting](https://eve.dev/docs/guides/deployment/self-hosting) documents local on-disk workflow state | A single process needs persistent storage and restart testing; database job state alone does not preserve eve sessions |
| Disk | [Render disks](https://render.com/docs/disks) support paid services; disk-backed services are single-instance and interrupt during deploys | Keep the web frontend separate from the research service; accept a brief research interruption during pilot deploys |
| Database | [Render pricing](https://render.com/pricing) lists US$6 monthly for its smallest paid database; storage is separately metered | Reserve storage separately and use small connection pools |
| Authentication | [Better Auth magic links](https://better-auth.com/docs/plugins/magic-link) provides an application-owned email-link flow | Email delivery is still required; library integration is not an email service |
| Search | [Brave API pricing](https://api-dashboard.search.brave.com/documentation/pricing) lists US$5 per 1,000 requests and monthly credits | Budget gross search cost; do not depend on credits |
| AI | [Gateway model page](https://vercel.com/ai-gateway/models/gpt-4.1-mini) lists input US$0.40 and output US$1.60 per million tokens | Benchmark accuracy and keep model routing and fallback prices bounded |
| Email | [Resend pricing](https://resend.com/pricing) lists 3,000 emails monthly and 100 daily on Free; Pro is US$20 monthly | Daily and monthly admission controls are needed before enabling digests |
| Telegram | [Telegram FAQ](https://core.telegram.org/bots/faq) describes no-cost ordinary bot messaging with rate limits | Use explicit opt-in, conservative throttling and no paid broadcasts |

The current Render pricing page did not expose the web-service price cells through the available page reader. The worksheet therefore uses US$7 per small service as a provisional allowance, not a verified current checkout quote. Render's own [cost article](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses) gives a July 2026 web-plus-small-database example of approximately US$13. Reconfirm both service prices in the selected workspace before spending.

No account-specific credits, existing resources or customer quotas were inspected. Website retrieval from the research service is not proof that providers, payments or email delivery will work from the intended production region.

## 3 Runtime feasibility correction

The architecture proposed eve but did not yet choose its sandbox environment. Current [self-hosting guidance](https://eve.dev/docs/guides/deployment/self-hosting) says a production default build cannot rely on the development just-bash fallback when Docker is unavailable. That is a deployment gate.

An explicit [just-bash environment](https://eve.dev/docs/sandbox/just-bash) is a documented option without a container or VM. It lacks native process and network isolation. For this product, propose using it only to satisfy the runtime environment contract while the model receives narrowly typed application tools. Disable shell, filesystem tools, unrestricted fetch and self-modification; do not add custom commands or mount application directories. Source text remains untrusted data, never executable code.

This limited configuration must be proved against a pinned eve release. Validate the actual tools advertised to the model, structured extraction, budget enforcement, cancellation, filesystem persistence and restart recovery. If the framework still exposes unwanted capabilities, the spike fails. Do not weaken those boundaries to obtain a successful demo.

A managed sandbox is an alternative, not a free assumption. [Vercel Sandbox pricing](https://vercel.com/docs/sandbox/pricing) lists separate usage and plan constraints. Its no-cost quota cannot be assumed suitable for this public product without checking applicable terms. Adding a paid plan could break the US$30 target. A self-managed Docker host introduces operational work and remains unpriced here.

## 4 Monthly budget calculation

All amounts are USD. This is a planning worksheet using some confirmed unit rates and explicitly provisional service allowances; it is not an all-inclusive quote. Use [pilot-budget.json](pilot-budget.json) for the exact inputs.

| Item | Assumption | Gross monthly amount |
| --- | --- | --- |
| Render workspace | Hobby workspace, no paid workspace fee; eligibility to confirm | 0.00 |
| Web service | One small service; provisional allowance | 7.00 |
| Research service | One small private or web service; provisional allowance | 7.00 |
| PostgreSQL compute | Smallest paid plan | 6.00 |
| PostgreSQL storage reserve | Conservatively charge 1 GB at US$0.30 | 0.30 |
| Workflow disk | Proposed 1 GB at US$0.25; minimum selectable size to confirm | 0.25 |
| Search | 600 monthly requests at US$5 per 1,000 | 3.00 |
| Extraction | 300 calls, each 12,000 input and 2,000 output tokens | 2.40 |
| Translation | 87 calls, each 1,500 input and 500 output tokens | 0.12 |
| Email and Telegram | Within the proposed free allocations; no paid broadcast | 0.00 |
| Calculated subtotal | Exact subtotal US$26.0718 | 26.07 |
| Remaining to proposed ceiling | Before taxes and unpriced items | 3.93 |

Extraction arithmetic: 3.6 million input tokens × US$0.40 plus 0.6 million output tokens × US$1.60 = US$2.40. Translation arithmetic: 0.1305 million input tokens × US$0.40 plus 0.0435 million output tokens × US$1.60 = US$0.1218.

The call allowance must include system prompts, evidence, classification and any agent-loop history. It is not an allowance for three additional model calls per extraction. Multiple steps consume the same aggregate allocation; otherwise reprice before running.

If every extraction uses one equally sized repair call, the subtotal becomes US$28.4718. If all 600 search requests also retry once, another US$3 takes that stress case to US$31.4718, above the ceiling. Paid work must stop or defer before exhausting its reservation; retries are not automatically affordable.

Not priced: a sending domain if needed, domain renewal, taxes, foreign exchange or card fees, off-platform backup storage, build and bandwidth overages, paid staging, additional sandbox infrastructure and human review time. Existing account credits are not deducted. Reserve at least US$3 for measured uncertainty; a tax-inclusive budget can still fail. An upgrade from US$7 to US$25 for either service adds US$18 and invalidates the target.

## 5 Email capacity and pilot enrollment

The PRD's illustrative 100 daily email recipients would consume 3,000 messages in a 30-day month before logins, reminders or updates. The free email plan therefore does not safely support that scenario.

Proposed allocation:

| Email use | Daily reservation | 30 day reservation |
| --- | --- | --- |
| Daily digests | 50 | 1,500 |
| Sign-in and account messages | 20 | 600 |
| Reminders and material updates | 20 | 600 |
| Safety headroom | 10 | 300 |
| Total | 100 | 3,000 |

This is a capacity policy, not a prediction of actual sign-ins. Count all sends against both provider windows, including retries that the provider bills. Keep account-message capacity separate, rate-limit authentication abuse and monitor reservations. If authentication demand rises, defer optional messages and pause enrollment before promising delivery.

Users retain email or Telegram choice. When daily email capacity is full, explain the limit and offer an email waitlist, weekly email where quota permits, or Telegram with explicit consent. Never silently change the selected channel or digest frequency. Budget quota reservations must account for bursts and calendar-month lengths, not just a 30-day average.

Resend Pro adds US$20, making the normal subtotal US$46.0718 before unpriced items. It is a later scale option, not a hidden upgrade. Test sending-domain verification, provider policy suitability for opt-in opportunity digests, bounce webhooks, idempotency and inbox delivery during the spike.

Telegram messages should fit the provider's length limits and link to the complete digest. Use one compact message where possible; multipart messages count separately. A one-message-per-second global pilot throttle is deliberately conservative. Users still need email for sign-in in the proposed identity design.

## 6 Hosting comparison

| Option | Cost interpretation | Recommendation |
| --- | --- | --- |
| Separate Render web and research services | Conditional US$26.07 subtotal above; isolates research load | First candidate for the spike |
| Consolidated web and research runtime | About US$7 less in service allowances, but combined build, memory and deployment behavior unproved | Evaluate only if integration stays simple and jobs stay outside requests |
| Free web or expiring database plans | No recurring compute cost but unsuitable assumptions for continuous pilot operation | Development or demonstration only |
| Managed sandbox plus additional paid platform subscription | Requires an additional quote beyond this worksheet | Reassess if the constrained eve setup fails |

A PostgreSQL-backed queue avoids a separate Redis bill. Do not provision another scheduler service until the spike establishes whether the single research process can run a bounded scheduler loop and claim durable database jobs. On restart, it must recover overdue jobs safely. Scheduling is always server-side.

## 7 Source feasibility finding

The [source assessment](source-feasibility.md) records eight official pages. The sample supports starting with public HTML and human review. It does not establish scraping permission, API coverage or all-China completeness.

A key finding is that a relevant degree page and a scholarship page must not be joined into a funded opportunity without evidence that the award covers that program and intake. Some scholarship paths also charge application fees. Store those fees separately and display them even when tuition and living support are funded.

The source check found one explicit free smart-manufacturing course, several relevant university and scholarship leads, and an official event index. It did not verify a specific upcoming free event. Do not seed fabricated event records to make the catalogue look complete.

## 8 Next spike and exit criteria

1. Pin and install the proposed stack locally without production credentials.
2. Prove web sign-in behavior with a mail sink and two isolated synthetic users.
3. Run one eve extraction using fixed source text and a fake model, then an optional paid model test only within an authorized budget.
4. Verify that the model cannot access shell, files, secrets, arbitrary URLs or notification tools.
5. Kill and restart the worker with a pending job and durable workflow state; prove safe resumption without duplicate delivery.
6. Exercise budget reservations, provider timeouts and daily email admission control.
7. Benchmark memory and quote the exact selected hosting configuration.
8. Decide launch languages, event geography, account-age policy, sending domain and public pilot capacity before inviting users.

Documentation research is complete for this step. Runtime, region-specific access, provider account eligibility and inbox delivery remain untested. Stage 1 is conditional, not fully passed; a local scaffold spike can resolve technical unknowns without public deployment.

## 9 Evidence handling

Official pages were checked on 29 October 2026 using public retrieval and official-domain search where dynamic pricing cells were unavailable. Render Markdown references were attempted but the reader rejected their content type; the corresponding HTML references were read instead. Preserve this distinction when reconfirming rates.

Price changes require updating the worksheet and the dated recommendation. A successful documentation merge does not approve subscriptions, paid usage or unresolved product decisions.

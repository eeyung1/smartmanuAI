# Source collection and extraction pipeline

Implemented checkpoint: 30 October 2026. This extends the local prototype; it does not enable paid execution, install a scheduler or deploy a service.

## Collection

Register a source at `/admin/review`, then inspect its collection policy at `/admin/research`. An administrator must check ownership, permitted access and applicable site restrictions and record a permission note before enabling collection. The app stores that attestation; it does not automatically interpret robots.txt or establish legal permission. Synthetic sources cannot be collected live.

The shared scheduler enqueues up to 25 due registered sources per invocation, with a one-day interval and one active job per source. A worker claims one job with a one-minute lease and a unique token. Expired leases can be reclaimed; an old worker cannot commit after reclamation, expiry or source disablement. Failures retry after five minutes, up to three attempts. Terminal failures remain visible in the admin dashboard. There is no automatic publication or opportunity closure on retrieval failure.

Retrieval accepts HTTPS on the standard port, resolves all DNS addresses, rejects private and special ranges, and pins the validated address for the request while retaining hostname TLS verification. It sends no account cookies or authorization headers. All redirects are rejected. The request has a 15-second deadline, a 256,000-byte response limit, and supports uncompressed UTF-8 HTML or plain text only. PDF, browser-rendered pages and other encodings need separate adapters. HTML is converted to untrusted plain text; it is never executed. The stored extraction excerpt is at most 10,000 UTF-8 bytes, so later facts on a long page may be absent.

Normalized source excerpts are hashed. An unchanged excerpt updates its last-seen time without creating another candidate or requiring another model call. This does not refresh a published opportunity's verification time. Differences outside the captured excerpt are not detected. Candidates are deduplicated per source and content hash; cross-source semantic reconciliation remains pending.

Run while the embedded database's development server is stopped:

```sh
SMARTMANU_ENABLE_COLLECTION=1 npm run research:once
```

This schedules due sources and processes one job. Repeated invocation by a future scheduler will process the queue. No recurring infrastructure is installed by this change. In production, separate workers require PostgreSQL; PGlite must have one owning process.

## Extraction and review

`/admin/research` shows recent jobs and captured candidates. An administrator can inspect a source excerpt and import structured extraction JSON. This manual path makes no model call. The schema is `researchExtractionSchema` in `src/research/extraction.ts`: relevance, nullable opportunity details, and title/funding/deadline/eligibility citations with a nullable verbatim quote and an unknown-field reason.

The optional Gateway adapter uses the installed AI SDK's `generateText` with `Output.object`. It has no tools, user profiles, notification credentials or publication capability. It receives only the captured excerpt, with a 2,000-token output cap, 30-second timeout and SDK retries disabled. The excerpt has a byte limit; exact provider input-token accounting remains a provider qualification requirement.

Application code validates schema, output size, source quotations, a conservative smart-manufacturing topic check and title presence. Known funding and deadline claims require supporting quotes. Unknowns need reasons. Keyword and quotation checks are quality controls, not semantic proof of truth or prompt-injection immunity. Human review remains mandatory.

An accepted relevant extraction atomically creates a private draft and revision and links the candidate. It cannot publish, overwrite an existing published record or send alerts. Irrelevant candidates are recorded as rejected. Repeated imports conflict instead of creating duplicate drafts.

Paid execution is disabled by default. Before enabling it, review a model's current availability, data policy and worst-case cost, then configure:

| Environment variable | Purpose |
| --- | --- |
| SMARTMANU_ENABLE_PAID_RESEARCH | Explicit `1` opt-in to paid extraction |
| AI_GATEWAY_API_KEY | Gateway credential; never expose in UI or logs |
| SMARTMANU_EXTRACTION_MODEL | Approved `provider/model` identifier; no model is preselected |
| SMARTMANU_EXTRACTION_RESERVATION_MICROS | Reviewed worst-case call cost in microdollars |

The worker reserves that full amount atomically before the call and records one attempt per candidate. Concurrent requests cannot exceed the existing budget cap. Reservations are conservatively retained after success or failure; actual-cost reconciliation and period rollover remain pending. A crash leaves a reserved attempt, a provider failure leaves uncertain usage, and neither is automatically repeated. The system cannot guarantee a cost bound if the configured reservation is below the actual provider's worst-case charge.

With an approved configuration, the command contract is:

```sh
npm run research:once -- extract administrator@example.test CANDIDATE_ID
```

No paid call or live source retrieval is needed for tests. Model and network fixtures exercise failure paths without contacting external providers. The existing eve fixture agent still runs with external fetch disabled; this collection worker is deterministic application code, separate from eve's unresolved arbitrary in-flight recovery.

## Validation and remaining scope

The integration suite runs on PGlite locally and PostgreSQL 16 in CI. It covers persisted job recovery, fencing, source pause, retries, deduplication, evidence rejection, private drafts, budget accounting and uncertain-call suppression. Retrieval tests use in-memory responses and address fixtures; the live TLS/DNS path and a real model response still need an approved-source pilot. The HTTP suite checks admin page/API access and policy writes.

Open web search, candidate-link discovery, multiple opportunities per page, cross-source merges, conditional HTTP requests, precise deadlines, host-wide rate limits, Retry-After handling, automatic model dispatch, manual job/uncertain-cost recovery controls, data retention, browser visual validation and deployment remain pending. Admin lists are bounded recent views rather than full pagination. No provider spend, email/Telegram delivery or public-launch gate is claimed as complete.

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

Open web search, candidate-link discovery, multiple opportunities per page, cross-source merges, precise deadlines, host-wide rate limits, automatic model dispatch, uncertain model-cost recovery controls, data retention, browser visual validation and deployment remain pending. The dashboard keeps bounded recent views; the research browser below provides access to older records. No provider spend, email/Telegram delivery or public-launch gate is claimed as complete.

## Research browser and selected records

`/admin/research/browse` and GET `/api/admin/research/browse` provide administrator-only pages of 25 sources, jobs or candidates. Filters include literal source-name/identifier search, list-specific state and exact source ID. Source search also covers URLs. Counts and ordering are live offset pagination, not stable snapshots; concurrent changes may move records between pages. Candidate summaries preserve original captured wording. Job details and manual recovery controls are described below.

Source policy and candidate inspection links select exact UUID targets in `/admin/research?source=...` or `?candidate=...`. Candidate selection also includes its parent source. Selection survives saves through the same validated GET API query, including rejected/drafted candidates; ordinary consumers retain the existing sources/jobs/candidates response shape. The recent workspace stays bounded to 100 sources, 50 jobs and 25 candidates, plus at most one selected source/candidate. Missing targets fail explicitly. Duplicate, conflicting and unknown query parameters are rejected. Opening these screens performs no collection, extraction, publication or model call.

PGlite/PostgreSQL matrix tests and production HTTP fixtures exceed all three recent windows and cover pagination, source/state filters, literal searches, authorization, older selections, original text escaping, Chinese controls and retention after policy saves/manual rejection. Browser interaction/visual review and live-source/model pilots remain pending.


## Manual collection-job recovery

Open a job from the recent dashboard or research browser at `/admin/research/jobs/ID`. The administrator can cancel a queued/running job or queue a replacement for a failed/cancelled job, with a 10–1,000-character original reason. Expected state and attempt count reject stale actions. GET never mutates a job; the same-origin authenticated POST endpoint is `/api/admin/research/jobs/ID`. Lease tokens are never returned.

Cancellation clears the worker lease so a late result is discarded. It affects this job only; pausing future schedules remains a source-policy action. A replacement requires an enabled, non-synthetic source policy and no other active job for that source. It receives a new ID and zero attempts; the old state, attempts and diagnostic remain intact. Each old job can have only one replacement. Links connect predecessor and replacement, and a future retry acts on the replacement if it fails. Retry postpones the source's next scheduled run to at least one day ahead. These controls enqueue work but perform no fetch or model call. A separately enabled worker is still required.

Source/policy/job locks serialize recovery with policy changes, scheduling and worker completion. Audit records store actor, timestamp, original reason, previous state/attempts and replacement identity. The original job has at most one cancellation and one retry, so its displayed manual history is bounded to two entries. Shared audit contributions require operator-assisted account deletion and pending deletions cannot add an audit action. Research budgets, model usage reservations, publication and delivery are unchanged. Uncertain model-cost reconciliation, arbitrary agent crash recovery, browser interaction/visual review and live pilots remain pending.

PGlite/PostgreSQL tests cover stale actions, competing retries, restart persistence, active-job/policy gates, late-result fencing, preserved original history and reviewer privacy. Production HTTP checks cover sign-in/role/origin enforcement, strict inputs, redacted leases, bilingual controls, escaped original notes and replacement navigation.


## Conditional source retrieval

The collection worker now persists a source URL, exact snapshot identity and bounded HTTP validators after a successful full response. A later request sends `If-None-Match` when a valid ETag exists, otherwise `If-Modified-Since` for a valid Last-Modified date. Both strong and weak quoted ASCII ETags up to 512 characters are supported. Dates use the canonical IMF-fixdate format; malformed, oversized or header-injection values are ignored. This is a deliberately conservative subset of [RFC 9110 conditional requests](https://www.rfc-editor.org/rfc/rfc9110.html#name-conditional-requests).

A matching `304 Not Modified` completes the leased job and advances only the stored excerpt's observation time. It does not read a response body, create another snapshot/candidate, run extraction, publish or refresh any opportunity's `verified_at`. Reverification before alerts still requires the existing review process. An unsolicited 304, mismatched returned ETag or changed cache identity fails through the existing bounded retry path; no unchanged content is invented.

A full response replaces validator metadata even when the normalized excerpt hash is unchanged. Missing or invalid validators, `Cache-Control: no-store`, `Vary: *` and variation outside the adapter's fixed Accept/Accept-Encoding/User-Agent headers disable conditional metadata reuse. Subsequent collection downloads a full response. Stored source evidence remains part of the review archive; this implementation is not a general HTTP cache or a change to evidence-retention policy. Source URL changes prevent reuse of the old URL's validators.

The composite database foreign key binds a cached snapshot to its own source. Policy/job locks and lease tokens also fence 304 completion: expired, reclaimed, cancelled or paused work cannot advance observations or change validators. DNS address validation/pinning, anonymous HTTPS requests, redirect refusal, byte/encoding limits and timeouts are preserved. The compatibility `retrieveSource` function still returns full text; the collection worker uses the structured response adapter.

Stream fixtures test conditional headers, weak ETags, Last-Modified fallback, invalid metadata, no-store/Vary behavior, no-body 304 handling and redirect/content/size guards. PGlite/PostgreSQL matrix tests cover restart persistence, full/unchanged/304 transitions, exact source/snapshot binding, URL changes, late-worker fencing, cache races and unchanged publication verification. No live TLS/DNS request or model call is performed by these tests. A permitted-source pilot remains required before claiming live interoperability or measured bandwidth savings.


## Retry-After source pauses

For HTTP 429 and 503, retrieval destroys the error response without reading its body and records a diagnostic code. It accepts non-negative integer seconds or canonical IMF-fixdate Retry-After dates, consistent with the syntax in [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after) and the [429 status definition](https://www.rfc-editor.org/rfc/rfc6585.html#section-4). Malformed, duplicate, injected, unsupported date formats and values over 128 characters are ignored; the existing five-minute retry baseline applies. Past dates/zero seconds never shorten that baseline.

Supported waits up to seven days are stored for the source as well as the job. Scheduler and claim queries exclude sources still waiting; manual replacements inherit the original job availability and source deadline. Restarts and exhausted attempts do not remove the source wait. A valid wait longer than seven days marks the job failed and blocks that source until operator review, rather than silently capping the requested delay. This is per-source behavior; host-wide coordination and stricter source-specific pacing remain pending.

Job detail screens show source wait timestamps, job availability and any review-required pause in English/Simplified Chinese. An operator can review access/availability and save an enabled source policy with an audit note to clear the source pause. The interface states this effect explicitly. Existing job availability is retained, so clearing a source pause does not make an already-delayed job runnable early. Failed-job replacement and schedule rules continue to apply.

Failure completion now follows the policy/job lock order and requires the current unexpired lease. Paused, cancelled, reclaimed or expired work cannot record a new cooldown or overwrite a newer result. The three-attempt cap, evidence snapshots, validators, publication verification and model budgets remain unchanged. Database tests cover restart, source and job gating, replacement delays, review/resume, fallback/caps and stale-failure fencing on PGlite/PostgreSQL. Stream and production HTTP checks cover body rejection, parsing, bilingual pause/availability screens and authenticated operator actions. No live source is contacted by these checks.

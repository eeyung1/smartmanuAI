# Reviewed catalogue implementation

Checkpoint: 30 October 2026. Local prototype; no live collection, notifications or public deployment.

## Implemented flow

An administrator registers a source and enters a draft with source excerpts for title, funding, deadline and eligibility. The record stays private until explicit evidence verification and publication. Each change creates a revision with its actor and reason. Review mutations lock the record and reject outdated revision numbers with HTTP 409.

Public users can filter reviewed opportunities, read funding components, unknown fees, eligibility, source wording and verification dates, then save available records after signing in. Closing or revising a record removes it from discovery. Existing saves remain as history. Drafts and rejected records are hidden publicly.

## Conservative policies

- Fully funded requires explicit tuition, accommodation and living-cost coverage. Free participation does not imply a free certificate, travel or zero application fees.
- Scholarships must be in China. Online learning can be global; in-person records are restricted to China under the proposed geography decision D03.
- This slice supports date-only deadlines. It never invents a timezone. Dates on or before today in UTC are unavailable, including the entire closing day; precise timestamp support remains pending.
- Publication expires from discovery after seven days without a new verified publication revision. This is a conservative freshness rule, not an automated source recheck.
- Source URLs require HTTPS, no credentials, literal IPs, localhost or custom ports. This slice only displays links; it does not fetch them or verify institutional ownership automatically.
- Publication is a human attestation. Synthetic fixtures are explicitly seeded and labelled; they expose no application link.

## Validation

`npm run check` runs formatting, TypeScript, domain tests, a production build, HTTP integration and the existing bounded agent checkpoint test. Catalogue tests cover publication gates, revision conflicts, filtering, stale records, saved history, transaction rollback, budgets and notification deduplication. CI supplies PostgreSQL 16 for the same catalogue integration test. PostgreSQL is skipped locally unless `TEST_DATABASE_URL` is supplied.

The fixture agent build and runtime now preload a loopback-only fetch guard. This prevents eve’s optional external model-catalogue fetch during compilation; it does not enable a live model. A subprocess test verifies rejection before the underlying fetch is invoked and disallows redirect following.

The HTTP test exercises administrator access, draft privacy, publication, stale review rejection, filtering, detail rendering, saves, closure and audit history. These are HTTP and server-rendered HTML checks; browser interaction and visual validation remain pending.

## Remaining work

Source permissions and automated source validation, discovery and extraction, duplicate reconciliation, precise deadline timezones, multilingual UI, matching, complete saved status tracking, consent/channel setup and live provider delivery remain future slices. Admin lists are limited to the latest 100 sources and opportunities and need pagination before growth. The revision API is available; a full audit-history screen remains pending. Arbitrary in-flight agent crash recovery remains a deployment blocker.

## Expanded discovery filters — 2 November 2026

The public catalogue now combines free text, type, funding, teaching language, topic substring, scholarship study level, participation mode, location and deadline state. Free text searches titles, organizers and summaries; topic search checks each original topic string using a case-insensitive literal substring. Percent/underscore/backslash characters do not become search wildcards. This is not semantic or translated search; no model calls are made.

Study level supports bachelor/master/doctorate and explicitly unstated. Mode supports online/in-person. This prototype's location choices are China (CN), unstated or all; it does not expand the existing publication geography policy. Unstated country/level/deadline filters select null or absent source facts and do not infer eligibility or an online location. Other location facets and precise deadline timestamps remain future scope.

Deadline choices are any, explicitly dated, unstated or the next 30 UTC calendar dates. The window excludes today and includes day 30 under the existing conservative date-only rule; it is not a source-local closing-time calculation. Closed, draft, rejected, stale and expired/closing-today records remain excluded regardless of filters. Default funding exclusions remain unchanged.

The same validated schema serves UI/API and domain queries. Duplicate URL fields and invalid values are rejected by the API. Invalid web filters show a localized message and no result records, with a clear-filters link; they no longer silently broaden to the default catalogue. GET form submission starts at page one, and pagination links preserve every valid selected filter. These public browse filters do not alter a private profile or its language preferences.

Validation covers combined filters and two pages with no duplicate items, repeated matching topics without inflated counts, literal wildcard/injection-like input, date-window boundaries, unknown facts and publication/freshness exclusions on PGlite and PostgreSQL 16 in CI. Production HTTP checks cover bilingual labels, selected option values, preserved pagination URLs, API duplicate/invalid-field rejection and explicit invalid-web-filter handling. Browser/mobile visual review and full FR02/release acceptance remain pending.

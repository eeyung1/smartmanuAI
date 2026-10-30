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

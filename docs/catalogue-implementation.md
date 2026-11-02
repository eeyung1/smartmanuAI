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

Source permissions and automated source validation, discovery and extraction, duplicate reconciliation, precise deadline timezones, multilingual UI, matching, complete saved status tracking, consent/channel setup and live provider delivery remain future slices. The editor bootstrap is limited to the latest 100 sources and opportunities; the admin catalogue browser below provides access beyond that window. The research browser provides access beyond the source-policy dashboard’s recent window. The original revision API remains available; a bounded admin audit-history screen is described below. Arbitrary in-flight agent crash recovery remains a deployment blocker.

## Expanded discovery filters — 2 November 2026

The public catalogue now combines free text, type, funding, teaching language, topic substring, scholarship study level, participation mode, location and deadline state. Free text searches titles, organizers and summaries; topic search checks each original topic string using a case-insensitive literal substring. Percent/underscore/backslash characters do not become search wildcards. This is not semantic or translated search; no model calls are made.

Study level supports bachelor/master/doctorate and explicitly unstated. Mode supports online/in-person. This prototype's location choices are China (CN), unstated or all; it does not expand the existing publication geography policy. Unstated country/level/deadline filters select null or absent source facts and do not infer eligibility or an online location. Other location facets and precise deadline timestamps remain future scope.

Deadline choices are any, explicitly dated, unstated or the next 30 UTC calendar dates. The window excludes today and includes day 30 under the existing conservative date-only rule; it is not a source-local closing-time calculation. Closed, draft, rejected, stale and expired/closing-today records remain excluded regardless of filters. Default funding exclusions remain unchanged.

The same validated schema serves UI/API and domain queries. Duplicate URL fields and invalid values are rejected by the API. Invalid web filters show a localized message and no result records, with a clear-filters link; they no longer silently broaden to the default catalogue. GET form submission starts at page one, and pagination links preserve every valid selected filter. These public browse filters do not alter a private profile or its language preferences.

Validation covers combined filters and two pages with no duplicate items, repeated matching topics without inflated counts, literal wildcard/injection-like input, date-window boundaries, unknown facts and publication/freshness exclusions on PGlite and PostgreSQL 16 in CI. Production HTTP checks cover bilingual labels, selected option values, preserved pagination URLs, API duplicate/invalid-field rejection and explicit invalid-web-filter handling. Browser/mobile visual review and full FR02/release acceptance remain pending.

## Administrator audit history — 2 November 2026

Each review-queue record now links to `/admin/review/[id]/history`. The read-only screen shows the record's current registry source, stored revision state, actor identifier, original reason, UTC audit time, field changes and expandable full detail/evidence snapshots. Source wording and reviewer notes remain original and React-escaped; JSON field paths stay unchanged for operators. No author email, credentials or private notification data are added.

The new `/api/admin/opportunities/[id]/history` endpoint returns 20 revisions at a time, with an optional exclusive `before` revision cursor. It loads one older row to compare the last displayed item across a page boundary. Cursors remain stable when new revisions are inserted and queries are anchored to the record revision read at request time. Unknown/duplicate cursor fields are rejected. Administrators are checked at both the route and service layer; non-admin pages return generic not-found and APIs deny access. Responses, including authorization/validation failures, are no-store and no-referrer. The legacy revision-array endpoint is unchanged for existing consumers.

Comparisons include state, details and evidence. Object key ordering is ignored, array ordering is preserved, and missing fields, nulls, false, numeric/string zero and object/array types remain distinct. Initial snapshots are labelled as such. If the immediately preceding revision is missing, the screen explicitly withholds a comparison rather than asserting that nothing changed. Audit timestamps are UTC representations of stored database times at JavaScript millisecond precision, not source deadline times.

The history reader performs SELECTs only. It does not publish, restore, delete or rewrite revisions. Stored reasons and actor identifiers follow the existing shared-audit retention policy; this does not implement operator-assisted anonymization or immutable-database enforcement against a privileged SQL operator.

Tests cover authorization, 27 revisions across two pages, a new revision between page reads, a cross-page fee comparison, timestamp precision, missing predecessor handling and unchanged record counts on PGlite/PostgreSQL 16. Production HTTP checks cover English/Chinese controls, positive-to-zero fee history, escaped hostile notes, private draft exclusion and denied access for ordinary users. Browser/keyboard/visual review remains pending; the separate admin catalogue browser below addresses older record/source access.

## Searchable admin catalogue — 2 November 2026

`/admin/catalogue` provides administrator-only opportunity and source views in pages of 25. Opportunity search covers original titles, organizers and source names, with an optional publication-state filter. Source search covers names and URLs. Search is a literal case-insensitive substring: wildcard characters are escaped. English/Chinese controls preserve filters in pagination links; form search resets to page one. This is an offset-paginated live list, so edits can change ordering; it does not claim snapshot stability like the revision-history cursor.

Each opportunity links to its audit history and `/admin/review?edit=ID`. Each source links to `/admin/review?source=ID` for draft creation. The editor validates one target at a time, loads an exact older target and its source even when outside the latest 100, and preserves that source during subsequent refreshes. Bootstrap arrays are bounded to the latest 100 plus at most one selected item. The existing review editor/API shape remains compatible, and existing revision-conflict, draft/publication and evidence rules remain in force. No source or record is published, paused or collected by browsing.

New browse and editor GET responses use no-store/no-referrer, including authorization and validation failures. Duplicate/unknown parameters and contradictory source/state or edit/source selections are rejected. Ordinary-user pages remain generic not-found and API access is denied. Exact selection IDs, search text and SQL values are parameterized; original notes, URLs and source text are not translated in storage.

Database/HTTP fixtures contain more than 100 private records and sources. Tests verify pagination/counts, literal and injection-like searches, old-target selection, original source retention after editing, denied access, unknown-target failures, Chinese links/selected options, and an older correction that remains a private draft. These fixtures do not represent live opportunities. Research-policy/job/candidate browsing is described in [source pipeline](source-pipeline.md). Bulk actions, browser/keyboard/visual review and release gates remain pending.

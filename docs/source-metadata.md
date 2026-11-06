# Source type and language labels

Administrators can supply `sourceType` and `sourceLanguage` at source registration. Both default to `unknown` for old clients and existing records. Types are unknown, university, government, scholarship_body, training_provider, event_organizer and other. Languages are unknown, en, zh, multilingual and other; other does not encode a particular language.

The research screen allows later edits, including for a selected source outside the latest 100-source dashboard. PATCH `/api/admin/sources` requires the source UUID, current `expectedVersion`, sourceType and sourceLanguage. Authentication, administrator scope and same-origin checks apply. Successful changes increment metadataVersion; stale/concurrent edits return 409 with reload guidance. Only one of simultaneous updates at the same version succeeds. Unknown properties, URL changes, synthetic changes and invalid enums are rejected. The registration URL and source identity remain unchanged.

These labels describe the source and do not verify ownership, official status or permission to crawl. Source language is independent of teaching language, interface language, notification language and translation support. Metadata changes do not enable collection, reset scheduling, clear Retry-After holds, modify opportunity facts or update verified timestamps. Existing publication review and collection permission controls still apply. Public catalogue projections do not include these admin labels.

No automatic classification, metadata audit-history screen, consolidated success/failure counters or new live-provider capability is included. Migration 020 adds only constrained source columns in the private schema; hostname coordination is documented separately.

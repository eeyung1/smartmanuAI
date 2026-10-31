# Consent and local notification digests

Checkpoint: 31 October 2026. Local prototype only. Email and Telegram are channel simulations; no provider, bot, recipient destination or real message delivery is connected.

## User controls

The authenticated `/notifications` page stores one channel, enabled/paused state, daily or weekly frequency and an IANA timezone. Enabling requires explicit consent. Settings writes require the current version, reject forged fields and foreign origins, and cancel queued digest events atomically. The page includes an immediate pause action and the last 20 digest statuses.

Consent is versioned as `local-sink-v1`. It covers this local test sink only; a live provider must require a different consent version, verified binding and separate enablement. An older preference row without this consent cannot enter the new digest planner. The original scaffold's fixture outbox remains a separate local validation path and rechecks its own enabled flag.

## Schedule and planning

Daily digests use 09:00 in the selected timezone; weekly digests use Monday at 09:00. The scheduler uses the runtime's IANA timezone data. A repeated local time selects its first occurrence; a missing 09:00 advances to the first valid local time at or after 09:00. Entirely missing calendar dates are skipped. The persisted next due timestamp is UTC, while the UI formats it in the saved timezone.

A planner invocation claims one due preference with a database lock and schedules its next future slot. Missed runs coalesce into one current digest instead of replaying every missed day. Only one digest per user may be queued. Slot uniqueness includes the preference version, so cancelled settings can be replaced without replaying already accepted events.

The planner reuses deterministic matching, bounded to the latest 1,000 eligible catalogue candidates. It selects up to 10 unseen material event identities with source verification within the preceding 24 hours. Overflow remains unseen. An empty digest creates no delivery. A material event key combines the opportunity ID and material-fact fingerprint, independent of channel, profile version and cosmetic text changes.

## Local dispatch

Before inserting a sink message, the dispatcher reloads consent, channel and preference version, current profile and matches, dismissal, publication, deadline, material facts and 24-hour verification freshness. It coordinates user mutations and locks relevant records for the local database transaction. Invalid items are removed from the pending event set; a fully invalid digest is suppressed. A later eligible slot may consider a suppressed, never-accepted event again.

Sink insertion, event acceptance and digest acceptance commit together. Repeated or concurrent local dispatch does not duplicate an accepted digest. Accepted event identities persist across channel changes. These are transactional local-sink guarantees; they are not an exactly-once guarantee for a future external provider.

Payloads retain title, organizer, funding and remaining costs, source check time, date-only deadline uncertainty, match reasons and eligibility unknowns. Synthetic records have no application/source URL. The selected alert language is recorded, while unavailable translations explicitly fall back to English. Provider-accepted, delivered and read semantics are not implemented.

Run while the embedded database's development server is stopped:

```sh
npm run digest:once
```

The command plans one due user and dispatches one queued local digest. It does not install a recurring scheduler, send a real message or connect a channel. Multi-process production workers require PostgreSQL; PGlite must have one owning process.

## Validation and remaining work

Scheduling fixtures cover Lagos, Monday slots, New York daylight-saving transitions and an entirely skipped calendar date in Apia. PGlite and PostgreSQL integration exercise explicit consent, settings conflicts, queued persistence across restart, concurrent planner/dispatcher calls, capped overflow, empty suppression, accepted-event deduplication, channel changes, opt-out and current-state suppression after profile, freshness, closure and dismissal changes. HTTP checks cover session isolation, settings, invalid origin/ownership and pause.

The React review checklist was applied to the settings screen. Browser visual/accessibility validation remains pending. Telegram token binding and webhook verification, email verification/provider adapter, signed one-click unsubscribe, reminders and saved-item withdrawal/update consent, real provider retries and ambiguous acceptance, quotas, actual translations, retention/deletion, automatic source rechecks and scheduled hosting remain future work. Legacy fixture-outbox cancellation is evaluated at its dispatcher rather than rewritten by this feature. Stage 6 and public release are not complete.

# Personalized matching and tracking

Checkpoint: 31 October 2026. Local prototype; no live notifications or deployment.

## Matching

Users save independent interface, alert and teaching languages, nationality, optional age and qualification, target scholarship levels, topics, categories, funding, participation modes and preferred in-person countries. Nationality uses a two-letter uppercase code. The migration normalizes legacy nationality values; missing new preferences receive defaults. A changed profile increments its version; a repeated identical save does not.

Administrators can record source-supported study level and structured nationality, age and minimum qualification restrictions alongside the existing eligibility excerpt. Blank requirements mean unknown. `ALL` means the source explicitly permits all nationalities. The app does not infer restrictions from unstructured text.

Rules version 1 evaluates reviewed, current, open opportunities. Known restrictions or preference mismatches exclude a result. Missing source requirements or missing user information remain needs checking. The interface never labels a result as confirmed eligibility and reminds users to inspect official requirements, including language tests.

Ranking is deterministic: topic overlap adds 20, category/funding/teaching-language/target-level matches add 10 each, and mode/location matches add 5 each where relevant. These are relevance points, not probabilities. Topic comparison uses a small English/Chinese synonym map plus normalized exact strings. Ties sort by deadline and stable record ID.

Matches are recalculated on request, so there is no persisted stale match cache. Responses carry profile, rules and opportunity revisions. The latest 1,000 qualifying records are considered, with a disclosed truncation flag; results use 12-item pages. Concurrent profile edits can supersede an in-flight response, whose profile version identifies the inputs used. Broader catalogue matching and precise snapshot consistency remain future improvements.

## Tracker

The owner can save, mark interested/applying/applied, dismiss, restore or remove a save. Applied is self-reported. Status, save state and dismissal are independent: removing a save does not erase a dismissal; an explicit save restores the record and preserves application status. Closed and stale items remain in saved history and can receive user-reported status updates.

Tracker mutations require the expected version and reject conflicts with HTTP 409. Writes are scoped to the authenticated owner and reject forged ownership fields and invalid origins. Dismissal of a new item requires a currently available public record.

Dismissals store a fingerprint of material facts. Title and summary changes alone do not resurface a record. Funding components, fees, deadline wording, eligibility, organizer, category, level, topics, language, mode and location are material. A changed published record can reappear if it still matches. Revision numbers and verification timestamps alone are not material. This is a defined prototype policy, not semantic change understanding.

Saved history displays the last public title, preventing an unpublished revision from leaking through the tracker. Unpublished drafts cannot be closed to bypass publication review. The tracker currently returns the 100 most recently updated active saved/dismissed rows; full pagination is pending.

## Validation and limits

Domain tests cover known failures versus unknowns, topic synonyms, material fingerprints, profile versions, two-user isolation, stale tracker versions, persistence after database restart, cosmetic versus material revisions, closed-record history and unpublished-title privacy. The same integration case runs on PostgreSQL 16 in CI and PGlite locally. HTTP checks cover authenticated matching, tracker changes, forged fields, invalid origins, dismissal and restoration. Production build and the existing offline agent check remain required.

The React review checklist was applied to the changed screens. Browser interaction, visual and accessibility testing still need a browser-capable environment. The English interface discloses translation fallback; storing a language preference does not mean translated screens or alerts are complete. Residence, age freshness, detailed qualification equivalence, language-test rules, account age/privacy policy, full FR04–FR06 acceptance coverage, notifications and public release remain pending.

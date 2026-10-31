# Language support

Local implementation checkpoint: 31 October 2026. This adds template translation without model calls, paid services or live provider sending. English (`en`) and Simplified Chinese (`zh-Hans`) are prototype options; final launch locale approval remains open.

## Independent preferences

- **Display:** the accessible language selector sets a browser-scoped, HTTP-only, SameSite=Lax cookie. Explicit selection wins; without a valid cookie, a signed-in user's saved interface language is used; otherwise English is used. Saving profile preferences updates this browser cookie to the selected interface language. A browser override does not rewrite the account's profile or alter alerts. The cookie is retained for one year and contains only the locale.
- **Alerts:** each newly dispatched local digest uses the current saved alert language. Email subject, fixed safety notices, funding labels, fee/deadline labels and unsubscribe text are translated. The serialized digest records language, requested language, fallback, template version and rendered preview. Prepared delivery simulation requests retain their frozen body and idempotency identity across retries.
- **Teaching:** accepted teaching languages continue to filter matches independently. Changing display or alert language does not change these filters.

English and Chinese navigation, footer, sign-in, catalogue, detail pages, preference forms, match explanations and tracker controls are implemented. A Chinese notice identifies the remaining English settings/privacy screens and unchanged source wording. HTML carries the selected locale; untranslated English screens remain in an English-language region, and translated screens override that region with their actual locale. Source titles/descriptions have an unspecified language rather than being labelled as translated Chinese. Interface copy is server-selected to avoid an English-first hydration flash; request-local caching does not share user preferences across users.

## Truthful alert content

Templates translate controlled labels, not arbitrary source text. Titles, positive/unknown fees and ISO date-only deadlines retain original wording. Missing fees say “Not stated” / “未说明”; they are never converted to zero. Tuition-only coverage remains distinct from tuition, accommodation and living-cost coverage. Notices ask users to check eligibility, full costs and the source deadline timezone. Long source strings are shortened with an ellipsis; details remain the place for full facts. These translations do not establish admission eligibility or a source's timezone.

Unknown future template languages fall back explicitly to English. Existing stored delivery snapshots with no language retain the old English default and fallback flag; retries are not silently rewritten. No automatic translation is claimed for catalogue titles, evidence, matching explanations or source descriptions. Email escapes untrusted text as HTML; Telegram remains plain text without parse mode. Both keep existing unsubscribe authentication, synthetic-only simulation restrictions and message limits.

## Validation and remaining scope

Tests cover Chinese local digest dispatch on PGlite and PostgreSQL 16, preserved original titles/costs/dates, null fees, coverage distinctions, HTML escaping, encoded links, legacy fallback and ten-item Unicode Telegram limits. HTTP checks exercise Chinese server-rendered sign-in, cookie flags, reload persistence, invalid-locale/origin/extra-field rejection, account isolation, saved-profile fallback and explicit browser override. Existing authorization, opt-out and delivery tests continue to run.

Alert settings, connection controls, privacy pages, admin tools and remaining service errors still need translation. Completed screens still need linguistic review. Browser/mobile visual validation, reviewed source translations, live-channel interoperability and launch gates remain open. The README marks only the completed local slices.

## Catalogue and workspace checkpoint

Translated labels use stable API values: funding, qualification, teaching-language and tracker status options explicitly retain their original values while showing localized text. No database records, matching rules, material fingerprints or application status semantics change. The source title “Save” remains “Save” even though the button “Save” is translated. Positive fees, null fees, source eligibility and ISO dates retain their distinctions; source text is never sent through the label lookup. Topic explanations translate only the controlled prefix and preserve matched topic names.

Client screens inherit a request-selected locale through a small provider; server pages use the same translator. The provider resets transient messages when the display locale changes, while saved state reloads from the server. Known UI/service messages are translated; unrecognized service messages are shown with an explicit original-wording prefix in Chinese.

HTTP coverage now exercises Chinese search/empty states, details, paid and unknown fees, original source titles, qualification and tracker option values, localized match explanations and a real tracker update using the unchanged API value. Browser interaction and visual checks remain pending.

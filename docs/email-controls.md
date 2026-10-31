# Email suppression and unsubscribe controls

Checkpoint: 31 October 2026. Local prototype only. No sending domain, Resend account, public webhook, real outbound email or deployment is configured.

## Signed unsubscribe

Email sink payloads contain local landing and one-click POST paths. Tokens combine a 32-byte random nonce with a purpose-scoped HMAC. Only the nonce hash, owner, email consent epoch, expiry and use time are stored. Tokens expire after 90 days and reveal no email address or user ID. They authorize only pausing optional email digests.

`GET /unsubscribe?token=...` shows a static confirmation form without changing preferences. The page has no external resources, disables framing and caching, and sends no referrer. The form submits a confirmation POST without requiring a session. `POST /api/notifications/unsubscribe?token=...` also accepts the form-encoded `List-Unsubscribe=One-Click` body. GET/HEAD cannot trigger unsubscription. Invalid/tampered/expired tokens fail; repeated valid requests are idempotent.

A token remains valid across frequency/timezone edits in the same email consent epoch. Disabling email and explicitly opting in again, or switching away and back, creates a new epoch. Older links then acknowledge without changing that newer consent. They never pause Telegram, authentication mail or another owner. This is the prototype's scoped-consent policy; actual mailbox behavior and full acceptance criteria require a live pilot.

An authenticated owner can generate a local test link at `/api/me/email-unsubscribe` while email digests are enabled, or through `/notifications`. The link is private bearer capability data. Production access logs and observability must redact tokens before launch.

## Email event verification

`POST /api/webhooks/email` implements the Resend/Svix-shaped signature contract: signed message ID, timestamp and exact raw body bytes; HMAC-SHA256; versioned signature lists; constant-time comparison; and a five-minute clock tolerance. JSON is parsed only after authentication. Requests are byte-bounded. Local setup generates dedicated synthetic signing credentials; no real provider is registered.

Only `email.bounced` and `email.complained` create suppression. Other event types cannot clear it. Events are deduplicated by authenticated event ID. The callback must match both a recorded digest provider-message ID and its immutable keyed recipient hash. It cannot identify an owner solely by a supplied email address.

The trusted background adapter contract `recordEmailDigestAttempt` records one owner/recipient per provider message ID. It is not exposed as a browser API and must be called outside another transaction. An early callback is retained as unmatched, with hashed recipients; registration later reconciles it atomically. This prevents losing a bounce that arrives before the provider's send response is recorded. Unmatched events from other mail streams do not pause users.

Suppression is destination-specific and sticky. A complaint outranks a bounce, including its audit reference. A current matching destination is paused and queued email digest events are cancelled; selected Telegram preferences remain active. Settings, planning and dispatch check suppression. An owner cannot clear it by toggling email on again. Changed recipient ownership and provider-message reuse are checked; raw callback bodies and recipient addresses are not stored in the new event/attempt tables.

## Configuration and local use

`npm run setup:local` adds missing values without replacing existing settings or logging secrets:

| Setting | Purpose |
| --- | --- |
| SMARTMANU_EMAIL_MODE=local | Local email-control mode; other modes are rejected |
| EMAIL_WEBHOOK_SIGNING_SECRET | Dedicated `whsec_` base64 signing key; setup generates 32 random bytes |
| NOTIFICATION_UNSUBSCRIBE_KEY | Dedicated 32-byte hex key for signed tokens and purpose-scoped recipient hashes |

Restart after updating configuration. On `/notifications`, enable local email digests and generate a test unsubscribe link. Opening it must not change state; confirmation must pause that email subscription. `npm run digest:once` creates local payloads with signed paths when it accepts an email digest. The HTTP suite exercises this without sending mail.

The native crypto verifier is tested with independently constructed signed fixtures, tampering and timestamp bounds; it has not been qualified against a live Resend account. Key rotation must preserve or migrate existing suppression hashes; no rotation or recovery workflow is implemented.

## Validation and remaining scope

PGlite and PostgreSQL integration cover scoped/idempotent unsubscribe, schedule edits versus new consent, token tampering/expiry, queue cancellation, owner/channel isolation, sticky suppression, recipient mismatch, provider-message conflicts, early callbacks, persistence and replay. HTTP checks cover non-mutating landing GET, cookie-free POST, private owner link issuance and authenticated callback replay. React review guidance was applied to the settings additions. Browser visual/accessibility validation remains pending.

This is not a complete RFC 8058 production implementation: public HTTPS, authenticated sending-domain/DKIM coverage, compliant email headers, multipart POST support and real mailbox qualification remain pending. Outbound email, provider quotas, delivery retries and uncertain acceptance, suppression review/support operations, retention/deletion, secret rotation and deployment remain future gates. No self-service suppression clearing endpoint is provided. Stage 6 and public release remain incomplete.

## Official references checked on 31 October 2026

- [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html): POST-based one-click unsubscribe and protection against automated GET fetches.
- [Svix signature verification](https://docs.svix.com/receiving/verifying-payloads/how) and [manual verification](https://www.svix.com/guides/receiving/receive-webhooks-with-php-laravel/): raw bytes, signature input and timestamp validation.
- [Resend's webhook reference](https://github.com/resend/resend-skills/blob/main/skills/resend/references/webhooks.md): callback headers, event names and payload shape.

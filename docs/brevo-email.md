# Brevo email integration

Brevo is the selected initial email provider. The owner has saved `BREVO_API_KEY`
and `EMAIL_FROM` in the Vercel Production environment. These settings are
owner-reported; no secret was retrieved and no live message has been sent.

## Implemented

- Server-only configuration parser for `BREVO_API_KEY` and `EMAIL_FROM`.
- Brevo HTTP request format with sender, recipient, subject and plain text.
- Fixed provider endpoint, redirect refusal, abort-signal forwarding and message-ID receipts.
- Explicit `brevo` option on the delivery-intent dispatcher; existing local fixtures remain unchanged.
- Unsubscribe headers embedded in Brevo's message headers, not HTTP headers.
- Rate-limit retry hints; ambiguous sends, server errors and missing receipts require reconciliation.
- Injected HTTP tests do not send emails or need credentials.

## Activation still pending

- Production runtime with a scoped database writer and current migrations.
- Bind real sign-in mail to the provider while preserving token/privacy checks.
- Bind the persisted consent/suppression/quota worker to this adapter.
- Brevo-specific authenticated delivery/bounce callbacks. The existing Resend-shaped verifier is not compatible.
- Live sender verification, one controlled email test, inbox receipt and link verification.
- Scheduling and pilot acceptance. Do not enable public sign-in from this adapter alone.

Saving credentials does not change `SMARTMANU_MODE`. The deployed read-only staging
mode still disables sign-in and sending. Do not set `production` yet: it is not
accepted by the current configuration. Production code must call `brevoConfig()`
and explicitly pass the result to the dispatcher with `brevoTransport()` only
after the application has checked consent, suppression and quotas.

The key remains a server-side secret; never prefix it with `NEXT_PUBLIC_` or put
it in repository files. `EMAIL_FROM` accepts `Name <email>` or a plain address.
Brevo may rewrite unauthenticated/free-domain senders; acceptance is not proof of
inbox delivery. Check the sender in the existing Brevo account before a pilot.

Provider contract: https://developers.brevo.com/docs/send-a-transactional-email

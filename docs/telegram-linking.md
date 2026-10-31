# Telegram linking and revocation

Checkpoint: 31 October 2026. This is a local protocol implementation and synthetic webhook test flow. No live bot, webhook registration, external message or public deployment is configured.

## Protocol

A signed-in owner requests a linking code from `POST /api/me/telegram`. The code contains 32 random bytes encoded as 43 base64url characters, is stored only as a SHA-256 hash, expires after ten minutes and is single-use. Issuing another code invalidates older unused codes, with a one-minute per-owner cooldown. The UI keeps the code in temporary component state, not a URL or local storage. It displays a local `/start CODE` command, not a live bot link.

`POST /api/webhooks/telegram` authenticates the configured secret header with a constant-time comparison before parsing a bounded request body. It persists update IDs for replay suppression. Unsupported updates are acknowledged without creating a binding. A valid linking message must come from a private, non-bot sender whose user ID equals the private chat ID. Group messages cannot bind a destination.

A valid code creates a pending binding. The signed-in app owner must confirm its current version through `PATCH /api/me/telegram`. Confirmation does not enable digests or change their channel. Destination chat IDs are encrypted with AES-256-GCM and authenticated against the app owner ID. A keyed hash enforces one pending/active owner per chat; API reads return only state, version and a suffix. No endpoint returns the encrypted or full destination.

Disconnect cancels unused codes and revokes the binding. A private-chat bot block/leave event also revokes a matching binding, pauses selected Telegram digest settings and suppresses queued Telegram digests. Email settings are not silently changed into a different channel. Unblocking alone never restores consent or a binding.

Event timestamps, with update IDs as same-second tie breakers, prevent an older linking/block message from replacing a newer chat event. A separate hashed chat-event ledger retains block ordering even without an active binding. Connection writes use a small database control-plane mutex before owner locks so competing claims and revocations serialize consistently. This prototype handles one bot namespace; multi-bot throughput and bot migration require further design.

## Local setup

`npm run setup:local` creates or adds missing local-only settings without replacing existing values or printing secrets:

| Setting | Purpose |
| --- | --- |
| SMARTMANU_TELEGRAM_MODE=local | Explicit local connection mode; other modes are rejected |
| TELEGRAM_WEBHOOK_SECRET | Dedicated webhook secret, at least 32 characters |
| TELEGRAM_LINK_ENCRYPTION_KEY | Dedicated random 32-byte key encoded as 64 hexadecimal characters |

Restart the development server after configuration changes, sign in, and open `/notifications`. Create a local code, then use a synthetic authenticated webhook fixture to exercise pending/confirmation. The HTTP integration test performs this automatically without contacting Telegram. There is no browser-facing webhook simulator and the secret must never be placed in client code.

The connection uses separate credentials from the bot token: no Telegram bot token is requested, stored or sent by this change. Encryption-key rotation, recovery and expiry cleanup are not implemented; retain the key securely and treat rotation as a migration task. Existing local-sink digest settings remain simulations and do not require a live binding. A future real dispatcher must require an active binding, current consent and a verified bot namespace.

## Validation and remaining gates

Tests run on PGlite and PostgreSQL 16 in CI. They cover missing configuration, wrong secret, ciphertext ownership, hashed tokens, cooldown, group rejection, sender mismatch, single use and replay, account isolation, conflicting chat ownership, expected versions, expired/cancelled codes, persistent revocation and duplicate update IDs, out-of-order blocks and queued-digest cancellation. HTTP tests cover authentication, forged owner fields, local linking, duplicate webhooks, confirmation and disconnect. The React review guidance was applied to the connection component; browser visual/accessibility checks remain pending.

Live bot creation, HTTPS webhook registration, operator-owned bot verification, recent-authentication requirements, live consent/binding integration, actual send adapters, blocked/failed provider responses, signed unsubscribe, email provider delivery, quotas, retention/deletion and production key management remain open. A valid local fixture is not proof that a real Telegram account is connected. Stage 6 and public release remain incomplete.

## Official protocol references checked on 31 October 2026

- [Telegram deep linking](https://core.telegram.org/bots/features#deep-linking): private-chat start parameters and base64url-compatible limits.
- [Telegram Bot API](https://core.telegram.org/bots/api): Update identifiers, private-chat membership events and the `X-Telegram-Bot-Api-Secret-Token` header configured through `setWebhook`.
- [Telegram webhook guide](https://core.telegram.org/bots/webhooks): live webhook transport and registration requirements, not enabled here.

# smartmanuAI

Building a public platform for smart manufacturing scholarships in China and free programs and events, with personalized email or Telegram alerts.

## Planning documents

1. [Product requirements](docs/smartmanuAI_PRD_v0_1.md)
2. [Screen flows](docs/screen-flows.md)
3. [Technical architecture](docs/technical-architecture.md)
4. [Delivery workflow and decision register](docs/delivery-workflow.md)
5. [Provider feasibility and pilot budget](docs/provider-feasibility.md)
6. [Official source feasibility sample](docs/source-feasibility.md)
7. [Budget worksheet](docs/pilot-budget.json)
8. [Local scaffold and validation](docs/local-spike.md)
9. [Reviewed catalogue implementation](docs/catalogue-implementation.md)
10. [Source collection and extraction pipeline](docs/source-pipeline.md)
11. [Personalized matching and tracking](docs/matching-tracker.md)
12. [Consent and local digests](docs/notification-digests.md)
13. [Telegram linking and revocation](docs/telegram-linking.md)
14. [Email suppression and unsubscribe](docs/email-controls.md)
15. [Outbound delivery simulation](docs/outbound-simulation.md)
16. [Account export and deletion](docs/account-privacy.md)
17. [Language support and translated templates](docs/language-support.md)

## Local development

Requires Node.js 24. No cloud accounts or provider keys are needed for the local spike.

```sh
npm ci
npm run setup:local
npm run db:migrate
npm run seed:local # optional, explicitly labelled synthetic catalogue
npm run dev
```

Open `http://127.0.0.1:3000`. Sign in with a synthetic `.test` email and open the matching link from the private `.local/mail.jsonl` sink. See the local validation guide for details and limitations.

```sh
npm run check
```

## Current status

Implemented locally:

- [x] Email-link sign-in and private user preferences
- [x] Reviewed catalogue, filters, detail pages and saved opportunities
- [x] Admin source registration, evidence review and revision history
- [x] Conservative funding, date and stale-listing checks
- [x] SQL migrations, notification sink and bounded eve fixture runtime
- [x] Durable source-collection jobs, bounded retrieval and snapshot deduplication
- [x] Evidence-checked extraction into private drafts and admin collection controls
- [ ] Live-source/model pilot and open-web discovery
- [x] Explainable personalized matches with explicit eligibility unknowns
- [x] Saved status tracking, dismissal and restoration across revisions
- [x] English/Simplified Chinese navigation, sign-in and independent display selection
- [x] English/Simplified Chinese digest templates with original source facts and explicit fallback
- [ ] Completed translated catalogue, private workspace, alert settings and privacy screens
- [x] Notification consent, channel selection, timezone digests and local opt-out
- [x] Local digest cap, overflow, deduplication and send-time eligibility checks
- [x] Local Telegram linking, encrypted binding, webhook validation and revocation
- [x] Signed email unsubscribe and authenticated bounce/complaint suppression
- [x] Outbound request adapters, quota/retry simulation and uncertain-send fencing
- [x] Private profile/activity export, immediate deletion revocation and resumable local purge
- [ ] Production retention, backup expiry and operator-assisted reviewer deletion
- [ ] Verified live channel connections and email/Telegram delivery
- [ ] Public pilot and deployment

To review records with the default embedded database, sign in first, stop the development server, then run `npm run admin:grant -- your-name@example.test` and restart the server before visiting `/admin/review`. Run migration and seed commands while the server is stopped as well; the embedded database must have only one owning process. This local command grants a role; there is no public role-grant endpoint. Optional fixtures are not real opportunities.

The catalogue, research, matching and digest integration suites run on PGlite locally. CI also runs them against PostgreSQL 16, using isolated schemas. Set `TEST_DATABASE_URL` to an expendable local PostgreSQL database to run that case locally; it is explicitly skipped when absent.

Source collection and optional model extraction are documented in the pipeline guide. Both live collection and paid execution require explicit configuration. Tests use fixtures; no paid calls or recurring infrastructure have been enabled.

Settled-session recovery has been exercised; arbitrary in-flight crash recovery remains unresolved. Browser visual validation, managed database validation, exact hosting quotes and launch decisions are still pending.

All changes follow a focused branch, validation, pull request and merge workflow. See the delivery workflow for implementation stages and release gates.

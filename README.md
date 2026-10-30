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
- [ ] Live Internet discovery and AI extraction
- [ ] Personalized matching and completed translated interfaces
- [ ] Email and Telegram delivery
- [ ] Public pilot and deployment

To review records with the default embedded database, sign in first, stop the development server, then run `npm run admin:grant -- your-name@example.test` and restart the server before visiting `/admin/review`. Run migration and seed commands while the server is stopped as well; the embedded database must have only one owning process. This local command grants a role; there is no public role-grant endpoint. Optional fixtures are not real opportunities.

The catalogue integration suite runs on PGlite locally. CI also runs it against PostgreSQL 16, using isolated schemas. Set `TEST_DATABASE_URL` to an expendable local PostgreSQL database to run that case locally; it is explicitly skipped when absent.

Settled-session recovery has been exercised; arbitrary in-flight crash recovery remains unresolved. Browser visual validation, managed database validation, exact hosting quotes and launch decisions are still pending.

All changes follow a focused branch, validation, pull request and merge workflow. See the delivery workflow for implementation stages and release gates.

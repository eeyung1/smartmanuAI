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

## Local development

Requires Node.js 24. No cloud accounts or provider keys are needed for the local spike.

```sh
npm ci
npm run setup:local
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:3000`. Sign in with a synthetic `.test` email and open the matching link from the private `.local/mail.jsonl` sink. See the local validation guide for details and limitations.

```sh
npm run check
```

## Current status

An executable local scaffold now provides email-link sign-in, private preferences and saved fixtures, SQL migrations, simulated notifications and a bounded eve fixture runtime. Live search, real AI extraction, provider delivery and public deployment are not connected.

Settled-session recovery has been exercised; arbitrary in-flight crash recovery remains unresolved. Browser visual validation, a real PostgreSQL server run, exact hosting quotes and launch decisions are still pending.

All changes follow a focused branch, validation, pull request and merge workflow. See the delivery workflow for implementation stages and release gates.

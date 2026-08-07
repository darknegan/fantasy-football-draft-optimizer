# DraftLab — Fantasy Football Draft Optimizer

Angular + PrimeNG frontend, Node/Fastify API, and pure TypeScript engines for player evaluation, draft strategy, and live recommendations.

## Monorepo

```
apps/web/                       Angular 21 + PrimeNG (DraftLab UI)
apps/api/                       Fastify API + Sleeper poller + WS gateway
packages/domain/                Shared types
packages/evaluation-engine/     Factor grading, archetypes, risk, value, DraftScore
packages/strategy-engine/       9 strategies, slots, adherence
packages/recommendation-engine/ Contextual live-draft scoring
packages/integrations/          Sleeper client + manual league setup
packages/ui/                    Design tokens
docs/                           Product + architecture plan
db/schema.sql                   Postgres target schema
```

## Quick start

```bash
npm install
npm run build:packages
npm run test:engines
npm run dev:api    # http://localhost:3001
npm run dev:web    # http://localhost:4200 (proxies /api)
```

Demo league id: `demo-league`.

## Verified model fixtures

Unit tests in `@draftlab/evaluation-engine` reproduce spreadsheet CeilingScores:

- Josh Allen → **41**
- Ja'Marr Chase → **42**
- Brock Bowers → **36**

RB CeilingScore ships **provisional** until benchmarks are added as config.

## Docs

See [`docs/PLAN.md`](docs/PLAN.md) and the linked design mocks.

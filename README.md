# DraftLab — Fantasy Football Draft Optimizer

Angular + PrimeNG frontend, Node/Fastify API, and pure TypeScript engines for player evaluation, draft strategy, and live recommendations.

## Monorepo

```
apps/web/                       Angular 21 + PrimeNG (DraftLab UI) + CF Worker
apps/api/                       Fastify API + Sleeper poller + WS gateway
apps/worker/                    Cloudflare Worker (Hono) API edge deploy
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
npm run dev:worker # http://localhost:8787 (API Worker)
npm run deploy:worker
npm run deploy:web    # Angular SPA Worker → proxies /api to draftlab-api
```

Demo league id: `demo-league`.

## Verified model fixtures

Unit tests in `@draftlab/evaluation-engine` reproduce spreadsheet CeilingScores:

- Josh Allen → **41**
- Ja'Marr Chase → **42**
- Brock Bowers → **36**

## Evaluation model

`DraftScore` blends four independently-graded pillars, each normalised to 0–100 before
weighting:

| Pillar    | Weight | Normalises via                                                                            |
| --------- | ------ | ----------------------------------------------------------------------------------------- |
| Ceiling   | 40%    | `(ceilingScore − posMin) / (posMax − posMin) × 100` — `null` → 50 (neutral, not punitive) |
| Archetype | 25%    | `(archetypeEv − −0.5) / 1.5 × 100`, clamped to [0, 100]                                   |
| Value     | 20%    | `(valueScore + 100) / 2` — `valueScore` is already ∈ [−100, 100]                          |
| Risk      | 15%    | `100 − riskProfile` — lower risk scores higher                                            |

If a position has no ceiling data (`ceilingScore` is `null` or provisional), its 40% is
redistributed rather than scored on a fabricated number: archetype +24pt → 49%, risk +16pt →
31%, value unchanged at 20%, ceiling → 0%.

### Ceiling: grade → points

Every ceiling factor grades independently against its position's benchmark
(`ratio = value / benchmark` for a higher-is-better factor, `benchmark / value` for a rank),
then sums to the raw `CeilingScore`:

| Grade   | Points | Ratio                     |
| ------- | ------ | ------------------------- |
| Green   | +5     | ≥ 1.05                    |
| Yellow  | +3     | ≥ 0.90                    |
| Orange  | −1     | ≥ 0.75                    |
| Red     | −3     | < 0.75                    |
| Unknown | 0      | no value or benchmark = 0 |

A position's achievable ceiling range is `knownFactors × [-3, +5]` — how many factors
actually carry a real per-player value today, not the position's full factor-list length —
so a position with fewer sourced factors isn't structurally capped below one with more.

| Position | Sourced | Raw range | Notes                                                                                                            |
| -------- | ------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| QB       | 8 / 12  | −24 … +40 | 5 nflverse + 3 play-by-play (deep ball, red zone, neutral pace); still missing PFF/ESPN/FTN-licensed factors     |
| RB       | 7 / 16  | −21 … +35 | Least covered — 4 of the video-sourced benchmarks (receptions, YPC, YPT, team wins) have no data behind them yet |
| TE       | 7 / 12  | −21 … +35 | 7 nflverse-sourced, including within-team target/TD rank                                                         |
| WR       | 6 / 12  | −18 … +30 | 5 nflverse + archetype; the rest are PFF/Reception-Perception-licensed                                           |

RB CeilingScore is no longer provisional — it ships graded on its 7 sourced factors like
every other position, with unsourced factors honestly `unknown` rather than gated entirely.

See [`docs/01-player-evaluation-model.md`](docs/01-player-evaluation-model.md) for the full
factor-by-factor rationale and source citations.

## Docs

See [`docs/PLAN.md`](docs/PLAN.md) and the linked design mocks.

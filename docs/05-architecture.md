# Architecture

Target stack, fixed by the project brief: **Angular** front end with the **PrimeNG**
component library, **Node.js** back end.

The repository already contains an Angular 21.2 workspace with PrimeNG 21.1 and the
`@primeuix/themes` Aura preset wired up in `src/app/app.config.ts`, plus Vitest for unit
tests. The front-end foundation is in place; the back end does not exist yet.

---

## 1. System Shape

```
┌─────────────────────────────────────────────────────────────────┐
│  Angular 21 SPA  ·  PrimeNG 21  ·  signals  ·  standalone       │
│  ┌───────────┬───────────┬───────────┬───────────┬───────────┐  │
│  │ Strategy  │  Player   │  League   │   Live    │  Dynasty  │  │
│  │  Planner  │   Board   │   Sync    │   Draft   │ /Auction  │  │
│  └───────────┴───────────┴───────────┴───────────┴───────────┘  │
│         signal stores  ·  WebSocket client  ·  IndexedDB        │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST + WebSocket
┌────────────────────────────┴────────────────────────────────────┐
│  Node.js API (Fastify + TypeScript)                             │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│  │ Evaluation   │  Strategy    │ Recommend-   │  Integration │  │
│  │   Engine     │   Engine     │ ation Engine │   Adapters   │  │
│  └──────────────┴──────────────┴──────────────┴──────────────┘  │
│  Draft Poller workers  ·  Rate limiter  ·  Auth  ·  WS gateway  │
└──────┬─────────────────────┬──────────────────┬─────────────────┘
       │                     │                  │
   PostgreSQL             Redis            Sleeper API / stats feeds
   (durable)         (draft state,
                      pub/sub, cache)
```

### 1.1 Why this shape

**The evaluation engine belongs on the server, not the client.** The factor grading and
archetype classification depend on data the client should not hold in bulk (full player
histories, licensed efficiency metrics) and must produce identical results across devices.
Pushing it client-side would also make the ranking model trivially extractable, which
matters if any of the underlying data is licensed.

**Draft polling must be centralised.** Per `03-league-integrations.md` §1.2, Sleeper's
per-IP budget is a shared resource across all users of the app. Polling from browsers would
be both wasteful and impossible to rate-limit coherently. One poller worker per active draft,
fanned out over the app's own WebSocket, is the only design that scales past a handful of
concurrent drafts.

**Redis holds live draft state, Postgres holds truth.** Draft state changes every few seconds
and is read constantly by the recommendation engine; it needs to be in memory and shared
across API instances, which also gives horizontal scaling and pub/sub fan-out for free. It is
written through to Postgres asynchronously so a Redis loss costs seconds of state rather than
the draft.

### 1.2 Framework choice for the back end

Fastify is the recommendation over Express: first-class TypeScript types, JSON schema
validation and serialisation built in (useful when shipping large player payloads), and a
mature WebSocket plugin. NestJS is a reasonable alternative if the team wants opinionated
structure and Angular-like DI, at the cost of more ceremony. Express would work but its
ecosystem for typed schema validation is comparatively hand-rolled.

The engines should be pure TypeScript packages with no framework dependency, so they can be
unit-tested directly against the fixtures in `public/stats/` and — importantly — shared with
the client for optimistic recalculation if that later proves necessary.

### 1.3 Monorepo layout

```
/
├── apps/
│   ├── web/                  # Angular app (migrate current src/ here)
│   └── api/                  # Fastify API + poller workers
├── packages/
│   ├── domain/               # shared types: Player, League, Draft, ScoringProfile
│   ├── evaluation-engine/    # factor grading, archetypes, risk, value  (pure)
│   ├── strategy-engine/      # 9 strategies, round plans, adherence     (pure)
│   ├── recommendation-engine/# contextual scoring                       (pure)
│   ├── integrations/         # Sleeper adapter + manual league setup
│   └── ui/                   # shared Angular components + design tokens
├── docs/                     # this plan
└── public/stats/             # source research artifacts (keep as fixtures)
```

Moving the existing `src/` into `apps/web/` is a one-time cost worth paying before the
codebase grows, and the pure engine packages being framework-free is what makes the model
testable against the spreadsheets it was derived from.

---

## 2. Data Model

Core entities, expressed as the shape the API returns rather than exact DDL:

```ts
interface Player {
  id: string;
  externalIds: { sleeper?: string; gsis?: string };
  name: string; team: string; position: Position;
  age: number; birthDate: string;
  seasonsInLeague: number; draftYear: number; draftRound: number | null;
  status: PlayerStatus;
}

interface PlayerSeason {
  playerId: string; season: number;
  gamesPlayed: number; gamesMissed: number;
  volume: VolumeStats;         // attempts, targets, receptions, TDs, snaps, routes
  efficiency: EfficiencyStats; // YPRR, QBR, DVOA, PFF, Reception Perception
  teamContext: TeamContext;    // PPG rank, pace, OL ranks, pass attempts
  positionalFinish: number | null;
  fantasyPpg: Record<ScoringVariant, number>;
}

interface InjuryEvent {
  playerId: string; season: number; type: string;
  severity: 'minor' | 'moderate' | 'serious';
  gamesMissed: number; isRecurrence: boolean;
}

interface MarketData {
  playerId: string; season: number;
  adpByRoundPick: string;      // "3.04"
  adpOverallPick: number;      // derived, depends on league size
  fseCombinedRank: number;
  espnProjectionRank: number;  // from the collected research, not the ESPN API
  rankDifference: number; auctionValue: number | null;
}

interface PlayerEvaluation {            // computed, cached per league
  playerId: string; leagueId: string;
  factors: FactorGrade[];               // position-configured factor list
  ceilingScore: number;                 // ±5 × known-factor count
  confidenceScore: number;              // known / configured factors
  archetype: Archetype;
  archetypeEv: number;
  riskProfile: number;                  // 0..100
  valueScore: number;                   // -100..100
  draftScore: number;
  projectedPoints: number;              // in league scoring
  vorp: number;
}

interface LeagueConnection {
  id: string; userId: string;
  platform: 'sleeper' | 'manual';
  externalLeagueId: string; season: number;
  leagueType: 'redraft' | 'dynasty' | 'auction';
  draftType: 'snake' | 'linear' | 'auction';
  teamCount: number;
  rosterShape: RosterShape;
  scoringProfile: ScoringProfile;
  contractRules: ContractRules | null;  // auction leagues
  userDraftSlot: number | null;
  selectedStrategy: StrategyId | null;
  syncStatus: SyncStatus;
}

interface DraftState {                  // Redis-resident, written through
  draftId: string; leagueId: string;
  status: 'pre_draft' | 'drafting' | 'paused' | 'complete';
  currentPickNumber: number;
  picks: DraftPick[];
  userRoster: RosterSlot[];
  budgets: Record<string, number> | null;   // auction
  inflationRate: number | null;             // auction
  lastSyncedAt: string;
  syncSource: 'poll' | 'manual';
}
```

Two modelling notes that matter. `PlayerEvaluation` is keyed on league as well as player,
because scoring settings and league size change `projectedPoints`, `vorp`, and `valueScore` —
caching one global evaluation would produce wrong recommendations in any non-standard league.
And `adpOverallPick` must be derived per league from `(round - 1) × teamCount + pick`, never
stored as a single global number.

---

## 3. API Surface

```
Auth & account
  POST   /auth/register · /auth/login · /auth/refresh
  GET    /me

League connections
  POST   /connections/sleeper            { username }        → discovered leagues
  POST   /leagues/manual                 { shape, scoring }  → manually configured league
  POST   /connections/:id/import         { leagueIds[] }
  GET    /connections
  DELETE /connections/:id
  POST   /leagues/:id/resync
  GET    /leagues/:id/scoring            → parsed ScoringProfile, plain-language summary
  PATCH  /leagues/:id/scoring            → manual override

Evaluation & board
  GET    /leagues/:id/board              ?position=&tier=&archetype=&sort=
  GET    /leagues/:id/players/:playerId  → full evaluation + factor breakdown
  GET    /leagues/:id/tiers
  POST   /leagues/:id/weights            → user-adjusted DraftScore weights

Strategy
  GET    /strategies                     → 9 strategies, tiers, definitions
  GET    /strategies/:id/plan            ?teamCount=&slot=&rosterShape=
  POST   /leagues/:id/strategy           { strategyId, draftSlot }
  POST   /leagues/:id/simulate           { strategyId, iterations } → outcome distribution
  GET    /draft-slots                    → slot tier list

Live draft
  POST   /leagues/:id/draft/start        → begins polling, returns wsUrl
  GET    /leagues/:id/draft/state
  POST   /leagues/:id/draft/picks        → manual pick entry (fallback path)
  DELETE /leagues/:id/draft/picks/:n     → undo a manual pick
  GET    /leagues/:id/draft/recommendations
  POST   /leagues/:id/draft/complete     → post-draft summary

Auction
  GET    /leagues/:id/auction/values
  POST   /leagues/:id/auction/bid        → record a completed bid, recompute inflation
  GET    /leagues/:id/auction/max-bid    ?playerId=
  GET    /leagues/:id/auction/nominations

WebSocket  /ws/draft/:draftId
  server → client: pick.made · state.sync · recommendations.updated ·
                   sync.degraded · draft.complete
  client → server: state.request · subscribe · unsubscribe
```

---

## 4. Front End

Angular 21 with standalone components and signals throughout — already the pattern in
`src/app/app.ts`. Feature-lazy routes:

```
/login                    account sign-in
/signup                   account registration
/                         dashboard (auth required; user’s leagues)
/leagues/connect          platform connection flow
/leagues/manual-setup     manual league setup
/leagues/:id/strategy     strategy planner
/leagues/:id/board        player board
/leagues/:id/board/:pid   player detail
/leagues/:id/draft        live draft room  (snake | auction | rookie by draft type)
/leagues/:id/roster       roster / dynasty view
/leagues/:id/recap        post-draft recap
/leagues/:id/auction      auction room
/leagues/:id/calibration  calibration
/research                 cross-league research: archetype and round-rate explorers
```

League-scoped routes return **404** when the league is missing or not owned by the
authenticated user (no existence leak via 403).


State via signal stores per feature, with `computed` for derived board ordering so re-ranking
on a pick event is a signal update rather than a manual refresh cycle. The draft store is the
one place where performance needs care: roughly 400 players re-scored on each pick event, so
the board should use PrimeNG's virtual scrolling and `computed` chains rather than
recalculating templates.

PrimeNG components that map directly to the screens: `p-table` with virtual scroll and
frozen columns for the board, `p-tag` and `p-badge` for archetype and tier markers,
`p-progressbar` for factor and adherence meters, `p-knob` or a custom radial for the
composite score, `p-timeline` for the round-by-round plan, `p-splitter` for the draft room
regions, `p-dialog` for player detail, `p-chart` for age curves and outcome distributions,
`p-toast` for pick notifications, and `p-selectbutton` for strategy and mode switching.

Client-side offline durability via IndexedDB, holding the last board snapshot and any queued
manual picks so a network drop mid-draft is survivable.

---

## 5. Delivery Phases

Sequenced by dependency, with the riskiest and most differentiating work deliberately early:

**Phase 1 — Foundations.** Monorepo restructure, domain types, Postgres schema, player and
season ingest for a single season, the factor grading engine with the QB/WR/TE benchmarks
from `01-player-evaluation-model.md`, and unit tests that reproduce the three spot-check
scores (Allen 41, Chase 42, Bowers 36) from the source spreadsheets. Those tests are the
proof the model is faithfully implemented.

**Phase 2 — Board and strategy.** Archetype classification, risk and value models, composite
`DraftScore`, the nine strategies with round plans, and the player board plus strategy planner
UI. At the end of this phase the app is a useful pre-draft tool with no integrations.

**Phase 3 — Sleeper integration.** Connection flow, league and scoring import, scoring
validation against last season's standings, per-league recalculation, multi-league support.

**Phase 4 — Live draft.** Poller workers, rate limiter, Redis draft state, WebSocket gateway,
recommendation engine, snake draft room, manual entry fallback, post-draft recap. The
flagship, and the phase where the failure modes in `04-live-draft-team-builder.md` §7 must all
be implemented rather than deferred.

**Phase 5 — Manual league setup.** The configuration UI for leagues on platforms the app does
not integrate with: league shape, roster positions, scoring with presets, draft details. This
replaces what was previously an ESPN integration phase and is substantially smaller, since it
reuses the manual pick entry path already built in phase 4 for draft-night resilience.

**Phase 6 — Dynasty and auction.** ✅ Multi-year value curves, rookie drafts, pick assets,
contend/rebuild mode, then the auction room with dollar values, inflation, max-bid, nomination
strategy, and configurable multi-year contract rule set (`@draftlab/dynasty-engine`,
`@draftlab/auction-engine`).

**Phase 7 — Calibration.** ✅ Outcome tracking on user picks, recommendation-versus-actual
comparison, and proposed recalibration of the §1.1 grading bands and §5 DraftScore weights
against observed results (`@draftlab/calibration-engine`). Full seasonal validation still
requires live draft history beyond the seeded demo log.

---

## 6. Principal Risks

**Sleeper polling is now the only external integration**, which is a smaller attack surface
than the original plan but concentrates the risk. It is a shared, unpriced dependency with a
documented sub-1,000-calls-per-minute per-IP ceiling and no SLA, load-bearing for the flagship
feature, during a few concentrated weeks per year. The mitigations in
`03-league-integrations.md` §1.2 need to be built in phase 4, not retrofitted. With no second
platform to fall back on, manual pick entry is not a nice-to-have — it is the only thing
standing between a Sleeper outage and a user with no working draft tool.

**Licensed efficiency metrics.** PFF grades, DVOA, and Reception Perception percentiles are
load-bearing in the WR and TE factor sets and are not freely redistributable. The realistic
starting point is a manually maintained seasonal CSV import, which caps how current those
factors can be and should be reflected in the `ConfidenceScore` shown to users.

**A 0% cell is a finite sample, not a law.** The round-4 tight end guidance
(`02-draft-strategy-engine.md` §2) rests on a zero in a sample of a few dozen. It is strong
evidence and the recommendation is unchanged, but the engine applies it as a heavy penalty
rather than a hard block, and always shows the underlying percentage.

**Two source images are cropped**, leaving Zero RB and Elite QB without tier grades and draft
slot 1.05 unrated. Small, but the app shows these as unrated rather than guessing.

### Resolved

- **RB ceiling scores** — RB is no longer provisional. Per `01-player-evaluation-model.md`
  §1.5, DraftLab configures 16 factors from FSE's 40-league-winner cohort and public
  nflverse-derived proxies; all 16 are currently sourced (raw range −80…80).
- **ESPN integration** — dropped on terms-of-service grounds rather than resolved. Reaching
  private leagues required sending full account session cookies to undocumented endpoints. See
  `03-league-integrations.md` §2; users on other platforms are served by manual league setup.
- **Elite TE timing** — the round-by-round outcome data wins over the strategy definition's
  "4-5 round" language. Elite TE window is rounds 2–3; round 4 is an explicit avoid.

# Live Draft Team Builder

The flagship feature. During a live draft the app tracks the board, maintains the user's
roster, and continuously re-ranks the available players against the user's chosen strategy
and current team needs.

The design constraint that governs everything here: **a user has between 30 and 120 seconds
to make a pick, and they are usually also talking to other people.** Recommendations must be
correct, fast, and readable at a glance. A screen that requires reading three tables to
decide is a screen that will not be used on draft night. Every decision below is downstream
of that.

---

## 1. Data Flow

```
Sleeper API                   Backend                          Angular client
─────────────                 ───────                          ──────────────
draft picks   ──poll──▶  DraftPoller
                              │
                              ├──▶ diff vs known picks
                              │
                              ├──▶ PickEvent[]  ──▶ DraftStateStore (Redis)
                              │                          │
                              │                          ├──▶ RecommendationEngine
                              │                          │
                              └──────────────────────────┴──▶ WebSocket ──▶ signals ──▶ UI
                                                                     ▲
manual pick entry ───────────────────────────────────────────────────┘
```

Both the polled feed and manual entry converge on the same `PickEvent` stream, which is what
makes the manual fallback a genuine equal path rather than a degraded mode. The client holds
no authority over draft state; it renders a projection of server state via Angular signals.

### 1.1 Latency budget

| Stage | Target |
| --- | --- |
| Upstream pick → backend aware | ≤ 2 s (polling interval, adaptive) |
| Backend aware → recommendations recomputed | ≤ 150 ms |
| Recomputed → rendered in browser | ≤ 100 ms |
| **Total pick → updated board** | **≤ 2.5 s** |

The polling interval dominates and is not fully within our control (see
`03-league-integrations.md` §1.2). The honest framing for users is a visible "last synced"
indicator rather than an implied real-time guarantee — showing a 2-second-old board while
claiming live sync erodes trust the first time someone notices a pick they can see on
Sleeper missing from the app. Optimistic local application of the user's own pick keeps their
action feeling instant while the upstream confirmation catches up.

### 1.2 Recomputation strategy

The base `DraftScore` (`01-player-evaluation-model.md` §5) is strategy- and
roster-independent, so it is computed once per player per league and cached. Only the
contextual layer recomputes per pick, which is what makes the 150 ms budget achievable across
roughly 400 relevant players:

```
ContextualScore(player) =
    DraftScore(player)                       // cached
  × strategyFit(player, plan, round)         // §2
  × rosterNeed(player, roster, rosterShape)  // §3
  × scarcityUrgency(player, board, nextPick) // §4
```

---

## 2. Strategy Fit

The compiled round-by-round plan from `02-draft-strategy-engine.md` yields a multiplier for
the current round:

| Plan classification | Multiplier |
| --- | --- |
| Primary position for this round | 1.25 |
| Secondary position | 1.00 |
| Avoid position | 0.60 |

The `avoid` case is where the app earns trust or loses it, and it must always be explained.
When a user in round 4 sees the TE they wanted pushed down the board, the card needs to say
"round 4 TEs have a 0% historical league-winner rate" — citing `Round League Winners.PNG` —
rather than silently demoting the player. A recommendation without a reason is
indistinguishable from a bug, and users will override it and stop trusting the next one.

The plan is also *time-aware*: the engine knows the user's remaining pick numbers from
`draft_order` and `slot_to_roster_id`, so it can distinguish "you can wait on TE" from "this
is your last realistic shot at a top-6 TE before your next two picks."

---

## 3. Roster Need

Needs derive from the roster shape imported with the league (`slots_qb`, `slots_rb`,
`slots_wr`, `slots_te`, flex, superflex, bench), compared against what the user has drafted.

```ts
interface PositionNeed {
  position: Position;
  starterSlotsRemaining: number;
  flexEligible: boolean;
  qualityGap: number;   // starter-quality shortfall, not just slot count
  urgency: 'critical' | 'high' | 'moderate' | 'low' | 'filled';
}
```

`qualityGap` is the part that separates this from a checklist. A user holding three RBs whose
projections are all below the positional replacement line does not have RB "filled" — they
have a quality problem the app should surface. Counting slots alone would tell them to draft
a fourth WR while their starting lineup bleeds points every week. Need is therefore measured
as the shortfall against *startable* production, not roster slots occupied.

Need also interacts with the archetype data in a way worth encoding: a roster whose RBs are
all Trusty Veterans carries concentrated injury risk (21.67% per player), so the engine
should raise RB depth urgency for that roster above what slot counting implies. The same
logic applies more sharply at WR, where Trusty Veterans miss time 30.56% of the time. This is
portfolio risk, and stacking three of the same fragile archetype is a failure mode users
never see coming.

---

## 4. Scarcity Urgency

Given ADP, the picks between now and the user's next selection, and the tier structure of the
remaining board, the engine estimates the survival probability of each player and of each
positional tier:

```
P(available at next pick) = f(adp, picksUntilNextTurn, positionRunInProgress)
```

Two signals matter most and both should be visible:

**Tier cliffs.** If four RBs remain in the current tier and the user has eight picks until
their next selection, that tier will very likely be gone. Taking the last player from a tier
is worth more than the raw score gap suggests, and the board should draw the tier break
explicitly so the user can see the cliff rather than being told about it.

**Position runs.** When five of the last seven picks were WRs, the remaining WR supply is
draining faster than ADP predicts and the app should react within the draft rather than
trusting a static average. Detecting a run in progress and adjusting urgency is a genuinely
useful real-time behaviour that static cheat sheets cannot offer — and it is the clearest
answer to "why do I need this instead of a printed ranking sheet."

The counterweight, which the engine must respect: urgency should never be allowed to override
a large quality gap. Panic-drafting the last player of a mediocre tier over a clearly better
player from a deeper position is a classic draft mistake, and an app that amplifies it is
worse than no app. Cap the scarcity multiplier's influence and show both factors on the card
so the user can see the trade-off being made.

---

## 5. Recommendation Output

Each recommendation carries the reasoning, because the reasoning is the product:

```ts
interface Recommendation {
  player: Player;
  contextualScore: number;
  rank: number;
  reasons: Reason[];          // ordered, most significant first
  fitsStrategy: boolean;
  fillsNeed: PositionNeed | null;
  survivalProbability: number;
  alternatives: Player[];     // similar value, different position
  riskFlags: RiskFlag[];      // injury, age, unsettled situation, low confidence
}
```

The UI shows the top three to five with a one-line rationale each, plus a full sortable board
behind them. Reason strings should be concrete and cite the data — "ELITE: 53.52% historical
return rate (interim Prime WR1 table), lowest bust rate of any archetype", "first or second in team targets, 28% in-line
rate", "FSE ranks him 30 spots ahead of ESPN at a round 7 price", "round 4 TEs have never won
a league in this sample" — rather than generic praise. Copy like "great value here" is
indistinguishable from every other fantasy tool and gives the user nothing to reason with.

`alternatives` deserves emphasis as a design choice. Presenting a single "best pick" invites
blind acceptance and gives the user nothing when they disagree. Showing the best available at
two or three positions with the trade-off stated keeps the human in the decision, which is
both more useful under time pressure and more honest about the model's precision. The
difference between the model's first and third recommendation is usually well inside its
margin of error, and pretending otherwise is false confidence.

The `riskFlags` must include a **low-confidence flag** driven by the `ConfidenceScore` from
`01-player-evaluation-model.md` §1. A player graded on seven known factors and five unknowns
should not appear alongside a fully-graded player with no visual distinction.

---

## 6. Draft Room UI Modes

### 6.1 Snake draft room

Layout regions: the board grid (rounds × teams, showing every pick made), the user's roster
with unfilled slots visible, the recommendation panel, the searchable available-player list
with filters, the pick timer and turn indicator, and the strategy adherence meter.

The primary state that must be legible from across a room is **whose turn it is and how many
picks until yours**. Everything else is secondary.

### 6.2 Auction room

Different shape entirely: the active nomination with current bid and bidder, the user's
remaining budget and max bid, a budget grid for all teams, the live inflation rate, dollar
values for remaining players, and nomination suggestions.

The critical live number is **max bid given remaining roster slots** — the calculation nobody
does correctly under pressure, and where the app provides the most concrete value. Second is
the inflation rate, which reframes every remaining price and is invisible without tracking.

### 6.3 Dynasty and rookie draft room

Adds multi-year value curves, roster age distribution, pick assets, and a contend/rebuild
toggle that reweights the recommender between current-season production and long-term value.

### 6.4 Post-draft

Roster grade by position, projected finish, strategy adherence summary, best and worst value
picks, and identified weaknesses to address on waivers. This is also the honest feedback
loop: recording what the app recommended versus what the user took, and how those players
actually performed, is the only way to know whether the model works. That comparison should
be built from the start, and it should be visible to users rather than kept internal.

---

## 7. Failure Modes

Draft night is the one time this application cannot be broken, and it depends on a
third-party API with no SLA. Each failure mode needs a defined behaviour:

| Failure | Behaviour |
| --- | --- |
| Upstream poll returns `429` | Exponential backoff, switch to `last_picked` checks only, warn the user, keep the board usable |
| Upstream unreachable | Banner plus automatic switch to manual pick entry; no loss of state |
| WebSocket drops | Client reconnects with backoff and requests full state resync |
| Client offline | Local state persists in IndexedDB; queued manual picks reconcile on reconnect |
| Recommendation engine error | Fall back to the cached base `DraftScore` board, clearly labelled as degraded |
| Pick detected that conflicts with local state | Server state wins; show the correction rather than silently rewriting |

The through-line is that the app must always remain usable as a smart cheat sheet even when
every integration fails. A user mid-draft with a broken app has no recourse and will not
return next season.

# Career-stage archetypes: top-5 / top-8 ladder

Approved intent 2026-08-12 (brainstorming). Replaces the soft
positional top-12 breakout gate and the WR1/RB1 vs WR2 label split with a
shared career-stage ladder driven by **top-5** and **top-8 at-position**
finish counts.

## Problem

Today’s `hasPositionalTop12Finish` / `positionalTop12FinishCount` treat a
full fantasy “RB1/WR1” band (top 12 at position) as proof of breakout.
That is too generous: many soft starter-tier seasons escape
`BREAKOUT_CANDIDATE`. WR/RB also split prime by `teamPositionRank`, which
conflates “biggest share on a weak roster” with true alpha status (only
partly mitigated by volume blending).

## Decisions

| Decision | Choice |
|----------|--------|
| Breakout / proven bar | **Top 5 at position** (not top 12) |
| Pedigree for aging / late elite | **Top 8 at position** counts |
| WR1/RB1 vs WR2 labels | **Dropped** for now (no `teamPositionRank` in classification) |
| Volume blend on PRIME_*1 | **Removed** with those labels |
| PROVEN ceiling-factor grade | **Green (+3)** |
| TRUSTY_VETERAN ceiling-factor grade | **Green (+3)** (was red under old map) |
| `IN_THEIR_PRIME` ceiling-factor grade | **Yellow (+1)** |
| `BREAKOUT_CANDIDATE` ceiling-factor grade | **Orange (−1)** |
| New `VETERAN` | Aging without résumé → **red (−3)** |
| New `ELITE` | Pedigreed peak → factor-grade **`elite` (+5)** — deliberate exception to “categoricals never emit elite” |
| QB veteran age | **34+** (not 28 / year 7) |
| Rate tables | Interim reuse until a new historical study; mark provisional |
| Ceiling board UI (raw / top-N green) | **Out of scope** — separate follow-up |

## Taxonomy

```typescript
type ArchetypeId =
  | 'BREAKOUT_CANDIDATE'
  | 'PROVEN_BREAKOUT_CANDIDATE' // keep id for now; UI may say "Proven"
  | 'ELITE'
  | 'IN_THEIR_PRIME'
  | 'TRUSTY_VETERAN'
  | 'VETERAN';
```

**Removed:** `PRIME_WR1`, `PRIME_WR2`, `PRIME_RB1`, `PRIME_RB2`.

Finish counts are **at the player’s fantasy position** (same scoring basis
as today’s top-12 builder: season-total fantasy points, full PPR unless
the artifact pipeline standard changes). A top-5 finish **counts toward**
top-8 history (derived from the same seasonal ranks).

## Classification

Evaluate **in order 1→7**; first match wins.

### RB / WR / TE

| # | Rule | Archetype |
|---|------|-----------|
| 1 | `seasonsInLeague ≤ 3` **and** top-5 finishes `= 0` | `BREAKOUT_CANDIDATE` |
| 2 | `seasonsInLeague ≤ 3` **and** top-5 finishes `= 1` | `PROVEN_BREAKOUT_CANDIDATE` |
| 3 | `seasonsInLeague ≤ 4` **and** top-5 finishes `≥ 2` | `ELITE` |
| 4 | `seasonsInLeague ≤ 6` **and** top-8 finishes `≥ 3` | `ELITE` |
| 5 | (`seasonsInLeague ≥ 7` **or** `age ≥ 28`) **and** top-8 finishes `≥ 3` | `TRUSTY_VETERAN` |
| 6 | (`seasonsInLeague ≥ 7` **or** `age ≥ 28`) **and** top-8 finishes `< 3` | `VETERAN` |
| 7 | Else | `IN_THEIR_PRIME` |

### QB

Same as above for rules **1–4** and **7**, except aging gates:

| # | Rule | Archetype |
|---|------|-----------|
| 5 | `age ≥ 34` **and** top-8 finishes `≥ 3` | `TRUSTY_VETERAN` |
| 6 | `age ≥ 34` **and** top-8 finishes `< 3` | `VETERAN` |

QB does **not** use `seasonsInLeague ≥ 7` for the veteran split (longevity).

### Intentional gaps (confirmed)

- Year 5–6 with 2× top-5 but `< 3` top-8 → `IN_THEIR_PRIME` (not ELITE).
- Year 7+ (or age gate) never stays `ELITE`; pedigreed agers become
  `TRUSTY_VETERAN`.
- Young players still hit rules 1–2 before age-based veteran rules.

**Do not change** the year-7+ / age → never stay `ELITE` gap, or young-player
precedence before age gates — those are load-bearing.

**Future knob (only if spot-checks warrant):** if year-5/6 players with **2×
top-5** look wrongly stuck in `IN_THEIR_PRIME` after real top-5/top-8 counts
land, widen rule 3 from `seasonsInLeague ≤ 4` to **`seasonsInLeague ≤ 6` and
top-5 ≥ 2 → `ELITE`**. That still requires two true alphas; it does not relax
the top-8≥3 path. Leave rule 3 at ≤4 until that evidence shows up.

## Ceiling factor grades

| Archetype | Grade | Weight (six-band) |
|-----------|--------|------------------:|
| `ELITE` | elite | +5 |
| `PROVEN_BREAKOUT_CANDIDATE` | green | +3 |
| `TRUSTY_VETERAN` | green | +3 |
| `IN_THEIR_PRIME` | yellow | +1 |
| `BREAKOUT_CANDIDATE` | orange | −1 |
| `VETERAN` | red | −3 |

**Exception:** archetype `ELITE` may emit factor-grade `elite`. Other categoricals
(injury, secondary-target) still never emit `elite` / `critical`. Aging cliff is
`ELITE` (+5) → `TRUSTY_VETERAN` (+3), not +5 → +1.

## ArchetypeEV rates (interim)

Until a dedicated study exists:

| New bucket | Interim rates source |
|------------|----------------------|
| `ELITE` | Former `PRIME_WR1` rates for WR; former undifferentiated prime (`PRIME_RB1`) for RB; `NEUTRAL_RATES` for QB/TE until studied |
| `PROVEN_BREAKOUT_CANDIDATE` | Reuse breakout rates (same as today’s proven interim) |
| `BREAKOUT_CANDIDATE` | Existing breakout tables (RB/WR); neutral for QB/TE |
| `IN_THEIR_PRIME` | WR: old `PRIME_WR2`; RB: old `PRIME_RB2`; QB/TE: `NEUTRAL_RATES` |
| `TRUSTY_VETERAN` | Existing trusty veteran tables (RB/WR); neutral for QB/TE |
| `VETERAN` | Provisional: copy trusty with `injuryRate + 0.05` and `boomRate − 0.05` (clamped to `[0,1]`), documented as placeholder |

Flag provisional rates in docs where interim.

**Removed:** `volumeRatio` / `blendRates` for PRIME_*1.

## Data / artifacts (sleeperMCP + DraftLab)

### sleeperMCP `build_factors.py`

- Generalize season rank helper to emit finish counts for **K ∈ {5, 8}**
  (optionally keep 12 for migration/debug).
- Bio fields (suggested):

```text
top5_finish_count: number
top5_finish_seasons: number[]
top8_finish_count: number
top8_finish_seasons: number[]
```

- Coverage report: histograms for top-5 / top-8 counts.
- Publish new artifacts to R2 after merge.

### DraftLab domain / ingest

```typescript
// Player
positionalTop5FinishCount: number;  // 0 default until mapped
positionalTop8FinishCount: number;
// Deprecate / remove after cutover:
// hasPositionalTop12Finish, positionalTop12FinishCount
```

Map from artifact bio in the factors loader. Seeds/fixtures updated to the
new fields.

## Code touch list (indicative)

| Area | Change |
|------|--------|
| `packages/domain` | New `ArchetypeId` set; finish-count fields |
| `packages/evaluation-engine/src/archetype.ts` | New classifiers; rates; drop PRIME_* + volume blend |
| `grade-factor.ts` | New categorical grade map |
| Tests | Rebaseline classify + EV + spot-checks (Bijan/Gibbs/Chase/…) |
| Web | Archetype labels/tones for `ELITE` / `VETERAN`; remove WR1/RB1 copy |
| Docs | `01-player-evaluation-model.md` §2; scoring canvas if it lists archetypes |
| sleeperMCP | Rank thresholds + bio + R2 publish |

## Acceptance

1. Classification unit tests cover rules 1–7 for skill + QB age-34 path.
2. No remaining references to `PRIME_WR1` / `PRIME_RB1` etc. in live paths.
3. Ceiling categorical grades match the table above.
4. Artifacts expose top-5 and top-8 counts; DraftLab maps them.
5. Spot-checks updated; known players land on expected buckets under new rules.
6. Eval model doc §2 rewritten to match.

## Non-goals

- Recalculating empirical boom/bust tables from a new multi-year study
  (interim rates only).
- Restoring team-rank WR1/RB2 split.
- Ceiling board denominator / top-N green styling (separate change).
- Changing six-band ratio grading.

## Open implementation notes (non-blocking)

- UI display string for `PROVEN_BREAKOUT_CANDIDATE` may shorten to “Proven”.
- Emitting top-12 in artifacts temporarily for diffs is optional during
  migration; not required at runtime after cutover.

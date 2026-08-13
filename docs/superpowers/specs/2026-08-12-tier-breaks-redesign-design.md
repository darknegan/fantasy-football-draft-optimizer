# Tier breaks redesign — board and cheat sheet

**Date:** 2026-08-12
**Status:** Approved, ready for implementation planning

## Problem

The board's tier breaks do not detect anything. `buildSections`
(`apps/web/src/app/features/board/board.component.ts:482-514`) cuts the visible
players at the 90th, 75th, and 50th percentiles _by count_, so tier 1 is always
the top ~10% of whatever is on screen, tier 2 the next 15%, and so on —
regardless of what the scores look like. A flat group of eight near-identical
players gets cut at ten percent anyway; a genuine cliff goes unmarked.

This contradicts the component's own specification. `docs/06-design-system-and-screens.md:222`
defines it as:

> **`TierBreak`** — the explicit horizontal rule between board tiers with a
> remaining-count and survival estimate, so cliffs are visible rather than described.

Three further defects follow from the same code:

1. **Tiers are relative to the active filter.** Sections are computed over
   `filteredSorted()` (`board.component.ts:318-324`), so filtering to RB makes the
   top 10% _of RBs_ "TIER 1". The same player is tier 1 in one view and tier 3 in
   another. With `hideDrafted` defaulting true (`:286`), grades also drift upward
   as the draft thins the pool, with nothing about the player having changed.

2. **Sort and tier disagree.** Sorting uses `recommendation?.contextualScore ?? draftScore`
   (`:470-471`) while bucketing uses `evaluation.draftScore` alone (`:498`). With
   contextual recommendations present, a row can sort above another yet render in a
   lower tier. Separately, because sections render tier-first, any non-default sort
   is broken into four independently-sorted runs.

3. **Two incompatible tier systems.** `packages/strategy-engine/src/tiers.ts`
   (`buildCheatSheet`) uses min-max normalisation — `(score - min) / span`, line 78 —
   not percentiles, despite the comment on line 48 claiming percentiles. One outlier
   stretches `span` and drags every other player's tier down. The same player can be
   "S / Elite" on the cheat sheet and "TIER 2" on the board, from one underlying number.

The root cause of the divergence is placement: board tiers live inside an Angular
component, where they cannot be shared or unit-tested, so the two implementations
drifted apart silently.

## Goals

Show all three of the things a tier break could mean, each in its own visual
channel, instead of overloading one horizontal rule:

- **Draft-round survival** — who is realistically gone before your next pick.
- **Scoring cliffs** — where a genuine gap in `draftScore` occurs.
- **Positional replacement level** — where a player stops being starter-quality
  for this league's roster shape.

Non-goal: changing how `draftScore` itself is computed. This work consumes
`draftScore` as it exists (a bounded 0–100 blend: ceiling 40%, archetype 25%,
value 20%, risk 15% — `packages/evaluation-engine/src/draft-score.ts`).

## Channel assignment

| Concept          | Visual channel                              | Depends on visible pool?   |
| ---------------- | ------------------------------------------- | -------------------------- |
| Survival band    | The horizontal rule (section partition)     | Yes — recomputed live      |
| Scoring cliff    | Inline `⌄ N pt gap` marker within a section | Yes — within band          |
| Quality grade    | Per-row letter chip `[S]`…`[D]`             | **No** — absolute          |
| Replacement band | Per-row chip `[RB1]`, `[FLEX]`, `[BENCH]`   | **No** — league shape only |

Survival owns the rule because it answers the actual draft-day question: take now
or wait. A consequence to accept deliberately: **the board is no longer globally
ranked by score.** The top overall player sits inside "gone before your next pick,"
and a high-`draftScore`, late-ADP player drops into a later band — surfacing value
rather than hiding it.

```
▼ GONE BEFORE YOUR NEXT PICK (2.09)          7 players
──────────────────────────────────────────────────────
 1  Bijan Robinson    RB  1.02   [S]  [RB1]
 2  CeeDee Lamb       WR  1.03   [S]  [WR1]
 4  Breece Hall       RB  1.07   [A]  [RB1]
       ⌄ cliff — 6.2 pt gap (3.9× typical)
 6  Jahmyr Gibbs      RB  1.12   [B]  [RB1]

▼ COIN FLIP                                  5 players
──────────────────────────────────────────────────────
 7  Kyren Williams    RB  2.01   [B]  [RB2]

▼ SHOULD BE THERE                           23 players
──────────────────────────────────────────────────────
 3  Tyreek Hill       WR  2.11   [S]  [WR1]   ← value
```

## Architecture

A new leaf package **`@draftlab/tiers`**, containing pure functions with no
dependencies beyond domain types. Both `apps/api` and `apps/web` import it.

`apps/web` currently depends only on `@draftlab/domain` and `@draftlab/ui`.
Importing `strategy-engine` into the browser would pull `simulate.ts` (381 lines
of Monte Carlo) toward the bundle, so the tier functions get their own package
rather than being added to an existing one.

```ts
qualityBand(draftScore: number, ceilingKnownFactors: number): QualityBand | null
detectCliffs(scores: number[], k?: number): CliffMarker[]
survivalBands(rows: TierRow[], nextPickOverall: number, picksUntilNext: number, teamCount: number, cuts?: SurvivalCuts): SurvivalBand[]
replacementBand(positionRank: number, position: Position, roster: RosterShape, teamCount: number): ReplacementBand
adpOverall(adpRoundPick: string, teamCount: number): number | null
estimateSurvivalProbability(input: SurvivalInput): number   // relocated, unchanged
```

`survivalBands` takes `picksUntilNext` explicitly rather than deriving it, because
the caller owns draft state and `estimateSurvivalProbability` needs both that and
`nextPickOverall`.

`TierRow` is the minimum a row must expose to be banded: player id, position,
`draftScore`, `ceilingKnownFactors`, and `adpRoundPick`. Each function is
independently testable and has one job.

### qualityBand

Fixed thresholds against the 0–100 `draftScore`. **One global set of thresholds,
not per-position ones:** `draftScore` is already position-normalised upstream —
`normaliseCeiling` scales the ceiling component against `CEILING_RANGE[position]`
(`packages/evaluation-engine/src/draft-score.ts:25-29`), and the archetype, value,
and risk components are position-agnostic. Re-normalising by position here would
double-apply that correction, so the function does not take a position at all.

Stateless by design: a grade never moves because someone else was drafted, and it
is identical on the board and the cheat sheet. Returns `null` when
`ceilingKnownFactors === 0` (see _No-data players_).

Confirmed against 218 real players (sleeperMCP player_factors.json v5): **S ≥ 70,
A ≥ 63, B ≥ 56, C ≥ 48, D below.** The design doc's provisional { S: 85, A: 75,
B: 62, C: 48 } assumed a 0–100 spread the weighted draftScore never occupies (real
range 33.0–75.7), so S was unreachable on the seed artifact.

### detectCliffs

Median-gap rule. For adjacent sorted scores, flag a gap when `gap ≥ k × medianGap`.
Returns index, absolute gap, and the multiple, so the UI can state "6.2 pt gap,
3.9× typical" rather than asserting a cliff without evidence.

A fixed point threshold is unusable here: `draftScore` is a weighted blend, so
adjacent gaps are tiny in the crowded middle of the distribution and large in the
sparse tails. An absolute cut-off would fire constantly at the tails and never in
the middle. The median-gap rule self-scales, and using the median rather than a
z-score keeps a few huge tail gaps from inflating the threshold and masking real
mid-board cliffs.

`k` is a parameter with a default tuned against real data, not a constant buried
in the function body. Confirmed value: **5.0** (the provisional **2.5** fired on
near-tie rounding noise — 42 cliffs on a 221-row board).

### survivalBands

Reuses the existing `estimateSurvivalProbability()` rather than reimplementing it.
That function currently lives in `packages/recommendation-engine/src/scarcity.ts`,
which would make `@draftlab/tiers` depend on `recommendation-engine` and stop it
being a leaf. Resolution: **`estimateSurvivalProbability` and its `SurvivalInput`
type move into `@draftlab/tiers`**, and `recommendation-engine` imports them from
there. It has exactly one internal consumer (`recommend.ts:130`) plus its tests, so
the move is contained. `scarcityUrgencyMultiplier` stays in `recommendation-engine`
— it is about recommendation urgency, not tiering.

`adpOverall()` also moves into this package from `board.component.ts:445-451`, and
changes its unparseable-input return from the `999` sentinel to `null`, so callers
cannot mistake "unknown" for "very late" (see _Edge cases_).

`survivalBands` partitions into three bands plus a trailing unknown band:

| Band                       | Survival probability | Meaning                                |
| -------------------------- | -------------------- | -------------------------------------- |
| Gone before your next pick | `p < 0.25`           | Take now or lose them                  |
| Coin flip                  | `0.25 ≤ p < 0.65`    | Genuinely uncertain                    |
| Should be there            | `p ≥ 0.65`           | Safe to wait                           |
| ADP unknown                | n/a                  | No usable ADP — no survival claim made |

These cut-points were confirmed against real ADP on the same artifact (see
`packages/tiers/src/survival.ts`). Alternative values (0.20/0.70, 0.30/0.60)
either collapsed coin-flip to noise or inflated "gone" on mid-round boards.

### replacementBand

Band _i_ covers positional ranks `(i-1) × teamCount + 1` through `i × teamCount`,
for _i_ up to `roster[position]`; then a flex band, then bench. In a 12-team,
2-RB league, RB ranks 1–12 are `RB1` and 13–24 are `RB2`. `roster.superflex`
extends the QB bands. Driven entirely by `RosterShape` and `teamCount`, so it is
independent of the visible pool.

## Board behaviour

**Sections.** `buildSections` is deleted. Sections come from `survivalBands()`,
so horizontal rules are stable across sort changes. The chosen sort key applies
_within_ each band. This removes the current scrambling defect by construction:
sorting by ADP now reads sensibly, because bands are themselves ADP-ordered.

**Chips.** Quality letter and replacement band render on every row in every sort
and filter. Neither depends on the visible pool, so neither changes when you
filter to RB or when picks come off the board.

**Cliff markers are axis-bound.** A cliff is a claim about two _adjacent rows_, so
it is computed on whatever score currently orders the list —
`contextualScore ?? draftScore`, matching `compareRows`. Under a risk or ADP sort,
adjacent rows are not score-ordered and a gap marker would be meaningless, so
**cliff markers render only under a score-based sort** and are hidden otherwise.
Cliffs are detected within each survival band, not across the whole list.

This also resolves defect 2: sort axis, cliff axis, and grade axis are now
explicitly different things with stated rules, rather than an unnoticed mismatch.

**Live recomputation.** `sections` is already a computed signal and re-derives on
each pick. The remaining work is replacing two placeholders:

- `estimateNextUserPick` (`board.component.ts:477-480`), currently
  `return league.draftSlot ?? 9`, becomes `snakePickNumbers()` from
  `strategy-engine/src/slots.ts` plus the count of picks already made.
- `survivalNote`'s hardcoded `n * 0.4` survivor estimate (`:529`) becomes the real
  estimator.

## No-data players

Commit `109fae7` established that zero-known-factor players must not distort real
rankings; `buildCheatSheet` currently handles this by excluding them from the
percentile math and listing them separately (`tiers.ts:28-36, 59-64`).

Absolute quality bands remove most of that problem structurally — an unmeasured
player can no longer stretch anyone else's grade. Two rules remain:

1. **Excluded from `detectCliffs` input.** A mostly-generic `draftScore` must not
   manufacture a gap between two measured players.
2. **Quality chip renders `—`, not a letter.** `qualityBand` returns `null` when
   `ceilingKnownFactors === 0`, because the underlying score is defaults rather
   than a judgment.

Consequence: the cheat sheet's separate `unranked` list is removed. Those players
stay in the board in ADP context, honestly marked, instead of being exiled to a
side list.

## Edge cases

| Case                               | Rule                                                                                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Median gap is 0 (many tied scores) | `k × 0 = 0` would flag every nonzero gap. Fall back to the mean of nonzero gaps; if none exist, report no cliffs.                                                                             |
| Missing / unparseable ADP          | `adpOverall()` returns a `999` sentinel (`board.component.ts:445-451`), which silently reads as "very late". Route these to the **ADP unknown** band instead of fabricating a survival claim. |
| Empty pool                         | Return no sections, no cliffs.                                                                                                                                                                |
| Single player                      | One band, no cliffs.                                                                                                                                                                          |
| All scores identical               | No cliffs; all players share one quality band.                                                                                                                                                |

## Testing

Four pure functions in a package means four independent unit suites:

- **qualityBand** — values at and either side of each band boundary; every
  position; `null` for zero-known-factor input.
- **detectCliffs** — flat list, uniform gaps, single large outlier, all-ties,
  empty, single element; the median-zero fallback.
- **survivalBands** — pre-draft, mid-draft, on the clock (`picksUntilNext === 0`),
  and unknown-ADP routing.
- **replacementBand** — varying `teamCount`, flex, superflex, and ranks past the
  bench boundary.

Two commitments carried from the working agreement:

**The existing `buildCheatSheet` tests will fail, and that is correct.** The output
changes on purpose. They are rewritten against the new semantics — not loosened,
skipped, or re-captured to go green.

**`k` must be validated by reading output, not by a green suite.** This work is
precisely the "plausible output rather than an error" failure mode: a wrong `k`
produces a board that looks fine and marks the wrong places. Implementation
includes running `detectCliffs` against the real seed artifact and inspecting where
the cliffs land, checking they fall where a human would put them, before the
default is fixed.

## Migration

| File                                                             | Change                                                                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/tiers/`                                                | New package: four functions, `adpOverall`, the relocated survival estimator, plus tests.                                     |
| `packages/strategy-engine/src/tiers.ts`                          | Deleted.                                                                                                                     |
| `packages/recommendation-engine/src/scarcity.ts`                 | `estimateSurvivalProbability` + `SurvivalInput` removed; `recommend.ts:130` and its tests import from `@draftlab/tiers`.     |
| `packages/strategy-engine/src/__tests__/simulate.test.ts:99-136` | `buildCheatSheet` tests move to the new package and are rewritten.                                                           |
| `apps/api/src/services/store.ts:647`                             | `cheatSheet()` repoints to the new package.                                                                                  |
| `apps/web/.../board.component.ts`                                | Remove `buildSections`; replace `estimateNextUserPick` and `survivalNote` internals; render the two chips and cliff markers. |
| `apps/web/package.json`, `apps/api/package.json`                 | Add `@draftlab/tiers`.                                                                                                       |

The cheat sheet's S–D letters become the same absolute bands as the board chip, so
there is one definition of "S" across the product.

The cheat sheet keeps its per-position grouping — it still presents QB, RB, WR, and
TE as separate lists. What changes is that the letters within each list come from
the global `qualityBand` thresholds rather than being recomputed relative to that
position's own min and max. A position with genuinely no elite players will
therefore show no S tier, rather than promoting its best available player to S by
construction as the current min-max implementation does.

## Visible behaviour changes

- The board is grouped by survival urgency, not by score rank; the top-ranked
  player is not always the top row.
- Tier letters no longer shift as the draft progresses or as filters change.
- The cheat sheet's `unranked` section disappears; those players appear inline
  marked `—`.
- Cliff markers appear only under a score-based sort.
- **A weak position can show no S tier at all.** Under absolute bands, a position
  whose best available player scores 71 shows that player as `[B]`. The current
  min-max implementation always promotes each position's best player to the top
  tier by construction, so this will read as a visible downgrade at thin positions.
  It is the intended behaviour — the grade now means the same thing everywhere —
  but it is the change most likely to look like a bug on first sight.

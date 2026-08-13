# Career-stage archetypes: top-5 / top-8 / top-12 ladder

Approved intent 2026-08-12 (brainstorming). Amended same day: rules 4–5
use **finish rate over career length** (top-8 / top-12 in over half of
seasons) so pedigreed mid-career QBs and skill players stay Elite / Trusty
instead of falling through to In Their Prime.

Replaces the soft positional top-12 *breakout* gate and the WR1/RB1 vs WR2
label split with a shared career-stage ladder.

## Problem

Today’s `hasPositionalTop12Finish` / `positionalTop12FinishCount` treat a
full fantasy “RB1/WR1” band (top 12 at position) as proof of breakout.
That is too generous: many soft starter-tier seasons escape
`BREAKOUT_CANDIDATE`. WR/RB also split prime by `teamPositionRank`, which
conflates “biggest share on a weak roster” with true alpha status.

After the first ladder cutover, a second problem showed up live: QB rules
that only awarded Trusty at age ≥34 left Allen / Mahomes / Lamar in
`IN_THEIR_PRIME` despite heavy top-8 résumés. Fixed by rate-based rules
4–5 (below), not a special-case QB patch alone.

## Decisions

| Decision | Choice |
|----------|--------|
| Breakout / proven bar | **Top 5 at position** (not top 12) |
| Sustained elite (rule 4) | **>4 seasons** and top-8 finishes **> half** of seasons |
| Sustained trusty (rule 5) | **>4 seasons** and top-12 finishes **> half** of seasons |
| “Over half” | `finishCount > seasonsInLeague / 2` (e.g. 5 yrs → ≥3; 8 yrs → ≥5) |
| WR1/RB1 vs WR2 labels | **Dropped** (no `teamPositionRank` in classification) |
| Volume blend on PRIME_*1 | **Removed** |
| PROVEN ceiling-factor grade | **Green (+3)** |
| TRUSTY_VETERAN ceiling-factor grade | **Green (+3)** |
| `IN_THEIR_PRIME` | **Yellow (+1)** |
| `BREAKOUT_CANDIDATE` | **Orange (−1)** |
| `VETERAN` | Aging without rate résumé → **red (−3)** |
| `ELITE` | Factor-grade **`elite` (+5)** — categorical exception |
| ELITE past year 6/7 | **Allowed** if rule 4 rate still holds |
| QB veteran (rule 6) | **age ≥34** only (not year ≥7) |
| Skill veteran (rule 6) | year ≥7 **or** age ≥28 |
| Rate tables | Interim reuse; mark provisional |
| Ceiling board UI | See `2026-08-12-drop-licensed-factors-te-yprr-design.md` (raw + top-5 green) |

## Taxonomy

```typescript
type ArchetypeId =
  | 'BREAKOUT_CANDIDATE'
  | 'PROVEN_BREAKOUT_CANDIDATE' // UI may say "Proven"
  | 'ELITE'
  | 'IN_THEIR_PRIME'
  | 'TRUSTY_VETERAN'
  | 'VETERAN';
```

**Removed:** `PRIME_WR1`, `PRIME_WR2`, `PRIME_RB1`, `PRIME_RB2`.

Finish counts are **at the player’s fantasy position** (season-total fantasy
points, full PPR unless the artifact pipeline standard changes). Nested
ranks: top-5 ⊆ top-8 ⊆ top-12 for the same season window.

### Half-rate helper

```typescript
function overHalf(finishCount: number, seasonsInLeague: number): boolean {
  return finishCount > seasonsInLeague / 2;
}
```

## Classification

Evaluate **in order 1→7**; first match wins.

### RB / WR / TE

| # | Rule | Archetype |
|---|------|-----------|
| 1 | `seasons ≤ 3` **and** top-5 `= 0` | `BREAKOUT_CANDIDATE` |
| 2 | `seasons ≤ 3` **and** top-5 `= 1` | `PROVEN_BREAKOUT_CANDIDATE` |
| 3 | `seasons ≤ 4` **and** top-5 `≥ 2` | `ELITE` |
| 4 | `seasons > 4` **and** `overHalf(top8, seasons)` | `ELITE` |
| 5 | `seasons > 4` **and** `overHalf(top12, seasons)` | `TRUSTY_VETERAN` |
| 6 | (`seasons ≥ 7` **or** `age ≥ 28`) — did not hit 4 or 5 | `VETERAN` |
| 7 | Else | `IN_THEIR_PRIME` |

### QB

Rules **1–5** and **7** identical. Rule **6** only:

| # | Rule | Archetype |
|---|------|-----------|
| 6 | `age ≥ 34` — did not hit 4 or 5 | `VETERAN` |

### Intentional behavior

- Young players still hit rules 1–2 before any later gate.
- Rule 4 before 5: top-8 half-rate is Elite; top-12 half-rate without top-8
  half-rate is Trusty.
- **ELITE can persist** past year 6/7 while the top-8 half-rate holds
  (e.g. Allen with 7 top-8s in 8 seasons → Elite).
- When the top-8 rate slips but top-12 half-rate holds → Trusty (green +3),
  not a fall off a cliff to Prime.
- Rule 6 “otherwise” means failed 4 and 5 — pedigree agers do not go red.
- Year 5–6 with 2× top-5 but failing half-rates → usually `IN_THEIR_PRIME`
  unless rule 3 still applies (≤4 seasons only).

**Future knob (only if spot-checks warrant):** widen rule 3 from
`seasons ≤ 4` to `seasons ≤ 6` + top-5 ≥ 2 → `ELITE`. Leave at ≤4 until
evidence shows year-5/6 double-alphas stuck wrongly in Prime.

**Superseded:** the earlier “year 7+ never stays ELITE” gap, and the
“QB Trusty only at age ≥34 with ≥3 top-8” gate — replaced by rules 4–5.

## Ceiling factor grades

| Archetype | Grade | Weight (six-band) |
|-----------|--------|------------------:|
| `ELITE` | elite | +5 |
| `PROVEN_BREAKOUT_CANDIDATE` | green | +3 |
| `TRUSTY_VETERAN` | green | +3 |
| `IN_THEIR_PRIME` | yellow | +1 |
| `BREAKOUT_CANDIDATE` | orange | −1 |
| `VETERAN` | red | −3 |

**Exception:** archetype `ELITE` may emit factor-grade `elite`. Other
categoricals (injury, secondary-target) still never emit `elite` /
`critical`. Soft aging step when rate slips: `ELITE` (+5) →
`TRUSTY_VETERAN` (+3).

## ArchetypeEV rates (interim)

| New bucket | Interim rates source |
|------------|----------------------|
| `ELITE` | Former `PRIME_WR1` for WR; former prime RB rates for RB; `NEUTRAL_RATES` for QB/TE |
| `PROVEN_BREAKOUT_CANDIDATE` | Reuse breakout rates |
| `BREAKOUT_CANDIDATE` | Existing breakout (RB/WR); neutral QB/TE |
| `IN_THEIR_PRIME` | WR: old `PRIME_WR2`; RB: old `PRIME_RB2`; QB/TE: neutral |
| `TRUSTY_VETERAN` | Existing trusty (RB/WR); neutral QB/TE |
| `VETERAN` | Trusty with `injuryRate + 0.05`, `boomRate − 0.05` (clamped), provisional |

**Removed:** `volumeRatio` / `blendRates` for PRIME_*1.

## Data / artifacts (sleeperMCP + DraftLab)

### sleeperMCP `build_factors.py`

Emit finish counts for **K ∈ {5, 8, 12}** (12 is required for rule 5, not
optional migration-only):

```text
top5_finish_count / top5_finish_seasons
top8_finish_count / top8_finish_seasons
top12_finish_count / top12_finish_seasons
```

Coverage histograms for all three. Publish to R2 after code lands.

### DraftLab domain / ingest

```typescript
positionalTop5FinishCount: number;
positionalTop8FinishCount: number;
positionalTop12FinishCount: number; // required for rule 5
```

Map from artifact bio. Prefer dropping deprecated
`hasPositionalTop12Finish` boolean once counts are universal; keep
`positionalTop12FinishCount` as the real field (or rename clearly).

Regenerate bundled `apps/api/data/player_factors.json` to schema with
top-5/8/12 so R2-miss bootstrap does not zero all counts.

## Code touch list (amendment delta)

| Area | Change |
|------|--------|
| `archetype.ts` | Replace rules 4–5 with `overHalf`; restore top-12 input; fix QB |
| Ladder tests | Rate cases (Allen-shaped, Trusty-without-Elite, Veteran) |
| Domain / ingest | Ensure top-12 count required and mapped |
| Docs / canvas | Sync §2 and weight hints |
| Bootstrap artifact | Regenerate schema with finish counts |
| Redeploy | Worker + web after merge |

## Acceptance

1. Unit tests: rules 1–7 skill + QB; `overHalf` edge seasons (5, 8, 9).
2. Live-shaped fixtures: high top-8 rate mid-career QB → `ELITE`, not Prime.
3. Grades unchanged from table above.
4. Artifacts + Player expose top-5, top-8, **and** top-12 counts.
5. Bundled bootstrap includes those counts (no silent zero on R2 miss).
6. Eval model doc §2 matches this amendment.

## Non-goals

- New empirical boom/bust study (interim rates only).
- Restoring team-rank WR1/RB2 split.
- Ceiling board display (raw + top-5 green) — see
  `2026-08-12-drop-licensed-factors-te-yprr-design.md`.
- Changing six-band ratio grading.

## Open notes

- UI: `PROVEN_BREAKOUT_CANDIDATE` → “Proven”.
- Half-rate rules 4–5 + required `positionalTop12FinishCount` are implemented
  on `feature/archetype-top5-ladder` (amendment shipped with redeploy).

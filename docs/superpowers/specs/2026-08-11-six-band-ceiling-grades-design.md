# Six-band ceiling grades with split volume/rank thresholds

Approved 2026-08-11 (brainstorming). DraftLab-only. Approach: expand
`FactorGrade` with `elite` / `critical`; keep one weight table; use
**separate ratio band sets** for volume (`higherBetter`) vs rank
(`lowerBetter`) so rank `benchmark/value` inflation does not mint elite
too cheaply.

## Problem

Today’s four-band rubric collapses the top and bottom:

| Grade | Ratio | Weight |
|-------|--------|-------:|
| green | ≥1.05 | +5 |
| yellow | ≥0.90 | +3 |
| orange | ≥0.75 | −1 |
| red | <0.75 | −3 |
| unknown | — | 0 |

There is no way to mark a true standout vs “merely above the elite-cohort
bar,” or a catastrophe vs “below orange.” Also, a single band table is
unfair across factor shapes: rank factors use `ratio = benchmark / value`,
so a #1 rank against a cohort mean ~12 yields ~12× — not comparable to
volume’s `value / benchmark`.

## Decisions

| Decision | Choice |
|----------|--------|
| New grades | `elite` (+5), `critical` (−5); green/yellow weights drop to +3 / +1 |
| Volume `eliteMin` | **1.15** (reachable standout above top-3 mean) |
| Rank `eliteMin` | **1.50** (clearly better than top-3 mean; ≈ rank ≤ 8 when bench=12) |
| Other thresholds | Shared: green 1.05, yellow 0.90, orange 0.75, red 0.50; critical `<0.50` |
| Band routing | `direction === 'lowerBetter'` → rank bands; else → volume bands |
| Categoricals | Injury / archetype / secondary-target stay green/yellow/orange/red/unknown only |
| Calibration v1 | Volume band knobs may stay editable; **rank bands fixed** |
| Docs / canvas | Update eval model doc + scoring-model canvas |

## Design

### Weights

```text
elite     +5
green     +3
yellow    +1
orange    −1
red       −3
critical  −5
unknown    0
```

`CEILING_RANGE[pos] = { min: n × (−5), max: n × (+5) }` where `n` is
`CEILING_KNOWN_FACTORS[pos]`.

### Volume bands (`higherBetter`)

Inclusive via `≥` (same pattern as today’s `gradeByRatio`):

| Grade | Ratio |
|-------|--------|
| elite | ≥ 1.15 |
| green | ≥ 1.05 |
| yellow | ≥ 0.90 |
| orange | ≥ 0.75 |
| red | ≥ 0.50 |
| critical | < 0.50 |

### Rank bands (`lowerBetter`)

Same ladder except elite:

| Grade | Ratio |
|-------|--------|
| elite | ≥ 1.50 |
| green | ≥ 1.05 |
| yellow | ≥ 0.90 |
| orange | ≥ 0.75 |
| red | ≥ 0.50 |
| critical | < 0.50 |

### Categoricals

No change to mapping tables. They never emit `elite` or `critical`.
Consequence: categorical green = **+3**, categorical red = **−3**.

### Domain / config shape

```typescript
type FactorGrade =
  | 'elite' | 'green' | 'yellow' | 'orange' | 'red' | 'critical' | 'unknown';

interface GradingBands {
  eliteMin: number;
  greenMin: number;
  yellowMin: number;
  orangeMin: number;
  redMin: number; // critical below this
}

// PositionBenchmarkConfig carries both:
volumeBands: GradingBands;
rankBands: GradingBands;
```

Defaults live in `grade-weights.ts` as `DEFAULT_VOLUME_BANDS` /
`DEFAULT_RANK_BANDS`. `gradeByRatio` selects the set from
`def.direction`.

### UI

- Tokens: `--dl-grade-elite`, `--dl-grade-critical` (+ fills) in
  `packages/ui/tokens.css`
- Board `.fcell`, player-detail glyphs / weight labels / grade counts
  (`E G Y O R C`)
- Keep draft “need-level critical” CSS distinct from factor-grade critical
- Sync duplicate `FactorGrade` in `apps/web/.../api.types.ts`

### Docs & scoring model canvas

- `docs/01-player-evaluation-model.md` — replace 4-band rubric; document
  split volume/rank thresholds; note ceiling range uses ±5
- Cursor canvas `canvases/draftlab-scoring-model.canvas.tsx` — update
  grade weights, band tables, coverage notes so the interactive model
  matches engine truth
- Any stale “green +5 / twelve factors / −36…60” copy in DraftLab docs

### Calibration

v1: leave rank bands constant. Calibration proposals may still nudge
volume `greenMin` / `yellowMin` / `orangeMin` (and optionally `eliteMin` /
`redMin` later). Do not silently apply volume proposals to rank bands.

## Touch list

| Area | Files (indicative) |
|------|-------------------|
| Domain | `packages/domain/src/index.ts` |
| Engine | `grade-factor.ts`, `grade-weights.ts`, `benchmarks.ts` band wiring |
| Calibration | `packages/calibration-engine/src/recalibrate.ts` (+ types) |
| Web | tokens, board/player-detail styles & labels, `api.types.ts` |
| Tests | `spot-checks`, `wr-ceiling-factors`, new band-boundary tests |
| Docs | `01-player-evaluation-model.md`, scoring-model canvas |

## Acceptance

1. Unit tests: volume elite at 1.15; rank elite at 1.50; critical `<0.50`;
   boundary inclusivity matches `≥` semantics.
2. Categorical graders never return `elite`/`critical`.
3. `CEILING_RANGE` uses ±5 × known-factor counts.
4. UI renders elite/critical distinctly; detail weight math matches table.
5. Spot-check fixtures re-baselined (do not preserve old Allen/Chase/Bowers
   raw ceiling sums under old weights).
6. Eval model doc + scoring-model canvas updated.
7. Worker redeploy after merge (web deploy if UI tokens ship).

## Non-goals

- sleeperMCP / artifact / benchmark recomputation
- Changing categorical severity taxonomies
- Per-factor custom bands beyond volume vs rank
- Opponent-adjusted rank ratios

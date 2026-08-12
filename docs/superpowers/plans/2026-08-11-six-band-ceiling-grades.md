# Six-Band Ceiling Grades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `elite` / `critical` grades with new weights (+5/+3/+1/−1/−3/−5), split volume vs rank ratio band tables (`eliteMin` 1.15 vs 1.50), update UI/docs/canvas, and redeploy Worker.

**Architecture:** Expand `FactorGrade` and `GradingBands` in `@draftlab/domain`. Engine selects `volumeBands` or `rankBands` from factor `direction` inside `gradeFactor`. Categoricals keep four-color mapping (never elite/critical). UI tokens + factor cells surface the new grades. No sleeperMCP changes.

**Tech Stack:** TypeScript, Vitest, Angular web, Cloudflare Worker (`deploy:worker` / `deploy:web`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-six-band-ceiling-grades-design.md`
- Weights: elite +5, green +3, yellow +1, orange −1, red −3, critical −5, unknown 0
- Volume bands: elite ≥1.15, green ≥1.05, yellow ≥0.90, orange ≥0.75, red ≥0.50, critical <0.50
- Rank bands: elite ≥1.50, else same thresholds as volume
- Routing: `lowerBetter` → rank bands; `higherBetter` → volume bands
- Categoricals never emit elite/critical
- Calibration v1: rank bands fixed; do not apply volume proposals to rank bands
- Out of scope: sleeperMCP/artifacts, categorical taxonomy changes
- TDD; commit after each green task
- Repo: `c:\Code\fantasy-football-draft-optimizer\fantasy-football-draft-optimizer`
- Canvas path (outside DraftLab git): `C:\Users\Jarrod\.cursor\projects\c-Code\canvases\draftlab-scoring-model.canvas.tsx`

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/domain/src/index.ts` | `FactorGrade`, `GradingBands`, `PositionBenchmarkConfig` |
| `packages/evaluation-engine/src/config/grade-weights.ts` | Weights, default volume/rank bands, `CEILING_RANGE` |
| `packages/evaluation-engine/src/grade-factor.ts` | Six-way `gradeByRatio`; band pick by direction in `gradeFactor` |
| `packages/evaluation-engine/src/ceiling.ts` | Pass both band sets into `gradeFactor` |
| `packages/evaluation-engine/src/config/benchmarks.ts` | Wire `volumeBands` / `rankBands` per position |
| `packages/calibration-engine/src/recalibrate.ts` | Operate on volume bands only |
| `packages/ui/tokens.css` | Elite/critical CSS variables |
| `apps/web/src/app/core/api.types.ts` | Sync `FactorGrade` |
| `apps/web/.../board` + `player-detail` | Styles, glyphs, weight labels |
| `docs/01-player-evaluation-model.md` | Rubric copy |
| Canvas `draftlab-scoring-model.canvas.tsx` | Interactive model sync |

---

### Task 1: Domain types + gradeByRatio + weights

**Files:**
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/evaluation-engine/src/config/grade-weights.ts`
- Modify: `packages/evaluation-engine/src/grade-factor.ts`
- Modify: `packages/evaluation-engine/src/ceiling.ts`
- Modify: `packages/evaluation-engine/src/config/benchmarks.ts`
- Create: `packages/evaluation-engine/src/__tests__/six-band-grades.test.ts`

**Interfaces:**
- Consumes: current `gradeByRatio` / `GRADE_WEIGHTS` / single `bands` on `PositionBenchmarkConfig`
- Produces:
  - `FactorGrade` includes `'elite' | 'critical'`
  - `GradingBands = { eliteMin, greenMin, yellowMin, orangeMin, redMin }`
  - `PositionBenchmarkConfig` has `volumeBands` and `rankBands` (**remove** single `bands`)
  - `DEFAULT_VOLUME_BANDS`, `DEFAULT_RANK_BANDS`
  - `GRADE_WEIGHTS` with new values
  - `CEILING_RANGE` uses `GRADE_WEIGHTS.critical` / `.elite`
  - `gradeFactor(def, input, volumeBands, rankBands, options)` picks bands via `def.direction === 'lowerBetter' ? rankBands : volumeBands`

- [ ] **Step 1: Write the failing test**

Create `packages/evaluation-engine/src/__tests__/six-band-grades.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANK_BANDS,
  DEFAULT_VOLUME_BANDS,
  GRADE_WEIGHTS,
  CEILING_RANGE,
} from '../config/grade-weights.js';
import {
  gradeByRatio,
  gradeInjuryConcern,
  gradeArchetypeFactor,
} from '../grade-factor.js';

describe('six-band weights', () => {
  it('uses elite/critical extremes', () => {
    expect(GRADE_WEIGHTS.elite).toBe(5);
    expect(GRADE_WEIGHTS.green).toBe(3);
    expect(GRADE_WEIGHTS.yellow).toBe(1);
    expect(GRADE_WEIGHTS.orange).toBe(-1);
    expect(GRADE_WEIGHTS.red).toBe(-3);
    expect(GRADE_WEIGHTS.critical).toBe(-5);
    expect(GRADE_WEIGHTS.unknown).toBe(0);
  });

  it('CEILING_RANGE uses ±5', () => {
    expect(CEILING_RANGE.WR.max).toBe(17 * 5);
    expect(CEILING_RANGE.WR.min).toBe(17 * -5);
    expect(CEILING_RANGE.QB.max).toBe(11 * 5);
    expect(CEILING_RANGE.RB.max).toBe(16 * 5);
    expect(CEILING_RANGE.TE.max).toBe(12 * 5);
  });
});

describe('volume bands', () => {
  const b = DEFAULT_VOLUME_BANDS;
  it('elite at 1.15', () => {
    expect(gradeByRatio(1.15, 1, 'higherBetter', b)).toBe('elite');
    expect(gradeByRatio(1.149, 1, 'higherBetter', b)).toBe('green');
  });
  it('critical below 0.50', () => {
    expect(gradeByRatio(0.49, 1, 'higherBetter', b)).toBe('critical');
    expect(gradeByRatio(0.5, 1, 'higherBetter', b)).toBe('red');
  });
});

describe('rank bands', () => {
  const b = DEFAULT_RANK_BANDS;
  it('elite at ratio 1.50', () => {
    // bench=12, value=8 → ratio 1.5 → elite
    expect(gradeByRatio(8, 12, 'lowerBetter', b)).toBe('elite');
    // 12/8.1 ≈ 1.481 → green
    expect(gradeByRatio(8.1, 12, 'lowerBetter', b)).toBe('green');
  });
  it('does not elite a mild beat that volume would', () => {
    // ratio 1.2 with rank bands → green, not elite
    expect(gradeByRatio(10, 12, 'lowerBetter', b)).toBe('green');
  });
});

describe('categoricals stay four-color', () => {
  it('injury serious is red not critical', () => {
    expect(gradeInjuryConcern('serious')).toBe('red');
  });
  it('prime archetype is green not elite', () => {
    expect(gradeArchetypeFactor('PRIME_WR1')).toBe('green');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd c:\Code\fantasy-football-draft-optimizer\fantasy-football-draft-optimizer
npx vitest run packages/evaluation-engine/src/__tests__/six-band-grades.test.ts
```

Expected: FAIL (missing exports / types / grades)

- [ ] **Step 3: Implement domain + weights + gradeByRatio**

In `packages/domain/src/index.ts`:

```typescript
export type FactorGrade =
  | 'elite'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'critical'
  | 'unknown';

export interface GradingBands {
  eliteMin: number;
  greenMin: number;
  yellowMin: number;
  orangeMin: number;
  redMin: number;
}

export interface PositionBenchmarkConfig {
  position: Position;
  season: number;
  factors: FactorDefinition[];
  volumeBands: GradingBands;
  rankBands: GradingBands;
  provisional?: boolean;
}
```

In `grade-weights.ts`:

```typescript
export const GRADE_WEIGHTS: Record<FactorGrade, number> = {
  elite: 5,
  green: 3,
  yellow: 1,
  orange: -1,
  red: -3,
  critical: -5,
  unknown: 0,
};

export const DEFAULT_VOLUME_BANDS = {
  eliteMin: 1.15,
  greenMin: 1.05,
  yellowMin: 0.9,
  orangeMin: 0.75,
  redMin: 0.5,
} as const satisfies GradingBands;

export const DEFAULT_RANK_BANDS = {
  eliteMin: 1.5,
  greenMin: 1.05,
  yellowMin: 0.9,
  orangeMin: 0.75,
  redMin: 0.5,
} as const satisfies GradingBands;

/** @deprecated use DEFAULT_VOLUME_BANDS — delete once all callers updated */
export const DEFAULT_GRADING_BANDS = DEFAULT_VOLUME_BANDS;

// CEILING_RANGE mapping:
{ min: n * GRADE_WEIGHTS.critical, max: n * GRADE_WEIGHTS.elite }
```

Keep existing `CEILING_KNOWN_FACTORS` counts (QB 11, RB 16, TE 12, WR 17).

In `grade-factor.ts`:

```typescript
export function gradeByRatio(
  value: number,
  benchmark: number,
  direction: FactorDefinition['direction'],
  bands: GradingBands,
): FactorGrade {
  if (benchmark === 0) return 'unknown';
  const ratio =
    direction === 'higherBetter' ? value / benchmark : benchmark / value;
  if (ratio >= bands.eliteMin) return 'elite';
  if (ratio >= bands.greenMin) return 'green';
  if (ratio >= bands.yellowMin) return 'yellow';
  if (ratio >= bands.orangeMin) return 'orange';
  if (ratio >= bands.redMin) return 'red';
  return 'critical';
}

export function gradeFactor(
  def: FactorDefinition,
  input: FactorInput | undefined,
  volumeBands: GradingBands,
  rankBands: GradingBands,
  options: GradeFactorOptions = {},
): GradedFactor {
  const bands =
    def.direction === 'lowerBetter' ? rankBands : volumeBands;
  // ... rest unchanged; use bands in gradeByRatio call
}
```

In `ceiling.ts`, change:

```typescript
gradeFactor(def, byId.get(def.id), config.volumeBands, config.rankBands, {
  softCapSerious: true,
}),
```

In `benchmarks.ts`, every position: replace `bands: { ...DEFAULT_GRADING_BANDS }` with:

```typescript
volumeBands: { ...DEFAULT_VOLUME_BANDS },
rankBands: { ...DEFAULT_RANK_BANDS },
```

Import `DEFAULT_VOLUME_BANDS` / `DEFAULT_RANK_BANDS` from `grade-weights.ts`.

Grep and fix any other compile breaks that still pass a single `bands` into `gradeFactor` or construct `PositionBenchmarkConfig` with old `bands`.

- [ ] **Step 4: Run six-band + evaluation-engine tests**

```bash
npx vitest run packages/evaluation-engine/src/__tests__/six-band-grades.test.ts
npx vitest run packages/evaluation-engine
```

Expected: six-band PASS. Broader suite may FAIL on old weight/CEILING_RANGE/spot-check assertions — those are Task 2. If only weight-literal asserts fail (e.g. `GRADE_WEIGHTS.green === 5`), fix those in Task 2, not by reverting weights.

- [ ] **Step 5: Commit**

```bash
git add packages/domain packages/evaluation-engine
git commit -m "$(cat <<'EOF'
feat: six-band grades with split volume/rank thresholds

EOF
)"
```

On Windows PowerShell, if HEREDOC is awkward, use:

```powershell
git commit -m "feat: six-band grades with split volume/rank thresholds"
```

---

### Task 2: Rebaseline spot-checks + CEILING_RANGE fixtures

**Files:**
- Modify: `packages/evaluation-engine/src/__tests__/spot-checks.test.ts`
- Modify: `packages/evaluation-engine/src/__tests__/wr-ceiling-factors.test.ts`
- Modify: `packages/evaluation-engine/src/__tests__/wr-yprr-catch-volume.test.ts`
- Modify: any other tests still asserting old weights / `bands:` / `DEFAULT_GRADING_BANDS` shape

**Interfaces:**
- Consumes: Task 1 weights/bands
- Produces: updated weight asserts; recalculated engineered ceiling sums; CEILING_RANGE min/max using ±5

- [ ] **Step 1: Update weight unit test in spot-checks**

```typescript
expect(GRADE_WEIGHTS.elite).toBe(5);
expect(GRADE_WEIGHTS.green).toBe(3);
expect(GRADE_WEIGHTS.yellow).toBe(1);
expect(GRADE_WEIGHTS.orange).toBe(-1);
expect(GRADE_WEIGHTS.red).toBe(-3);
expect(GRADE_WEIGHTS.critical).toBe(-5);
expect(GRADE_WEIGHTS.unknown).toBe(0);
```

Switch `DEFAULT_GRADING_BANDS` imports to `DEFAULT_VOLUME_BANDS` / `DEFAULT_RANK_BANDS` as appropriate.

- [ ] **Step 2: Recompute engineered ceiling fixtures**

For each engineered grade array in `spot-checks.test.ts`, expected score = `sum(GRADE_WEIGHTS[g])` under the **new** table. Do **not** force old Allen/Chase/Bowers raw ceilings (e.g. 41).

For ratio examples, pass the correct band set:

```typescript
expect(gradeByRatio(6.59, 5.74, 'higherBetter', DEFAULT_VOLUME_BANDS)).toBe('green');
// 6.59/5.74 ≈ 1.148 → green (below 1.15 elite)
```

- [ ] **Step 3: Fix CEILING_RANGE asserts**

```typescript
// wr-yprr-catch-volume / wr-ceiling-factors:
expect(CEILING_RANGE.WR.max).toBe(17 * 5); // 85
expect(CEILING_RANGE.WR.min).toBe(17 * -5); // -85
```

- [ ] **Step 4: Run evaluation-engine tests**

```bash
npx vitest run packages/evaluation-engine
```

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git commit -am "test: rebaseline ceiling fixtures for six-band weights"
```

---

### Task 3: Calibration volume-only

**Files:**
- Modify: `packages/calibration-engine/src/recalibrate.ts`
- Modify: `apps/web/src/app/core/api.types.ts` if it mirrors `GradingBands`
- Modify: calibration UI only if it hardcodes three band fields (add eliteMin/redMin display; still edit volume set only)

**Interfaces:**
- Consumes: five-field `GradingBands`
- Produces: proposals mutate a **volume** `GradingBands` copy; never touch rank defaults

- [ ] **Step 1: Update DEFAULT_BANDS shape**

```typescript
export const DEFAULT_BANDS: GradingBands = {
  eliteMin: 1.15,
  greenMin: 1.05,
  yellowMin: 0.9,
  orangeMin: 0.75,
  redMin: 0.5,
};
```

Keep proposal deltas nudging `greenMin` / `yellowMin` / `orangeMin` only in v1 (leave `eliteMin` / `redMin` unchanged).

Ensure any code that applied proposed bands into `PositionBenchmarkConfig` writes to `volumeBands` only and leaves `rankBands` as `DEFAULT_RANK_BANDS`.

- [ ] **Step 2: Run calibration + evaluation tests**

```bash
npx vitest run packages/calibration-engine packages/evaluation-engine
```

Expected: PASS

- [ ] **Step 3: Commit**

```powershell
git commit -am "fix: calibration uses five-field volume GradingBands"
```

---

### Task 4: UI tokens + board + player detail

**Files:**
- Modify: `packages/ui/tokens.css`
- Modify: `apps/web/src/app/core/api.types.ts` (`FactorGrade`)
- Modify: `apps/web/src/app/features/board/board.component.css` (and `.ts` if grades listed)
- Modify: `apps/web/src/app/features/player-detail/player-detail.component.ts` (+ css)
- Modify: `apps/web/src/styles.scss` grade helpers if present

**Interfaces:**
- Consumes: new `FactorGrade` values from API
- Produces: visible elite/critical styling; weight labels `+5/+3/+1/−1/−3/−5`

- [ ] **Step 1: Tokens**

In `packages/ui/tokens.css`:

```css
--dl-grade-elite: #0d9488; /* teal — distinct from green */
--dl-grade-elite-fill: #0d94881f;
--dl-grade-critical: #9f1239; /* deeper than red */
--dl-grade-critical-fill: #9f12391f;
```

Avoid purple glow / default AI palette. Keep draft “need-level critical” CSS distinct from factor-grade critical.

- [ ] **Step 2: Board `.fcell.elite` / `.fcell.critical`**

Mirror existing `.fcell.green` / `.fcell.red` pattern using the new tokens.

- [ ] **Step 3: Player detail glyphs + weights**

```typescript
const GRADE_GLYPH: Record<FactorGrade, string> = {
  elite: '★',
  green: '▲',
  yellow: '▬',
  orange: '▼',
  red: '▼',
  critical: '✘',
  unknown: '?',
};
const GRADE_WEIGHT_LABEL: Record<FactorGrade, string> = {
  elite: '+5',
  green: '+3',
  yellow: '+1',
  orange: '−1',
  red: '−3',
  critical: '−5',
  unknown: '0',
};
```

Update grade count string to include E and C (`E G Y O R C`). Fix any weighted-score breakdown that hardcodes `×5` for green.

Extend `INJURY_LABELS` / similar `Record<FactorGrade, …>` maps with elite/critical keys (unused at runtime) so TypeScript compiles.

- [ ] **Step 4: Typecheck / build packages that UI depends on**

```bash
npx vitest run packages/evaluation-engine
npm run build:packages
```

Expected: exit 0 (or project-equivalent build succeeds)

- [ ] **Step 5: Commit**

```powershell
git commit -am "feat: UI tokens and labels for elite/critical grades"
```

---

### Task 5: Docs + scoring model canvas

**Files:**
- Modify: `docs/01-player-evaluation-model.md`
- Modify: `C:\Users\Jarrod\.cursor\projects\c-Code\canvases\draftlab-scoring-model.canvas.tsx`
- Grep DraftLab docs for `green +5` / `−36` / four-band language and fix stale in-scope lines

**Interfaces:**
- Canvas must show:
  - New `GRADE_WEIGHTS`
  - `VOLUME_BANDS` / `RANK_BANDS` tables
  - Updated `CEILING_META` known counts post–ITEM-006: QB 11/12, RB 16/16, WR 17/17, TE 12/14; min/max = known×±5
  - Factor list aligned with shipped ITEM-006 (no QB `adp`; OL proxies; WR/TE pace; etc.) — sync from current `benchmarks.ts` if canvas is stale

- [ ] **Step 1: Update eval model doc**

Replace the old green=+5 / four-band rubric with the six-band + split volume/rank description from the spec. Note ceiling range uses ±5 × known-factor counts.

- [ ] **Step 2: Update canvas constants**

```typescript
const GRADE_WEIGHTS = {
  elite: 5,
  green: 3,
  yellow: 1,
  orange: -1,
  red: -3,
  critical: -5,
  unknown: 0,
} as const;
const VOLUME_BANDS = {
  eliteMin: 1.15,
  greenMin: 1.05,
  yellowMin: 0.9,
  orangeMin: 0.75,
  redMin: 0.5,
} as const;
const RANK_BANDS = {
  eliteMin: 1.5,
  greenMin: 1.05,
  yellowMin: 0.9,
  orangeMin: 0.75,
  redMin: 0.5,
} as const;
```

Update any in-canvas `gradeByRatio` helper and UI copy for six bands.

- [ ] **Step 3: Commit docs in DraftLab repo**

```powershell
git add docs
git commit -m "docs: six-band ceiling rubric and rank/volume band split"
```

Canvas lives outside the DraftLab git root — leave it edited on disk; note in the completion report if the host canvas file is untracked elsewhere.

---

### Task 6: Build packages + deploy Worker (+ web)

**Files:** none required beyond deploy

- [ ] **Step 1: Build**

```bash
cd c:\Code\fantasy-football-draft-optimizer\fantasy-football-draft-optimizer
npm run build:packages
```

Expected: exit 0

- [ ] **Step 2: Deploy Worker**

```bash
npm run deploy:worker
```

- [ ] **Step 3: Deploy web** (UI tokens ship with web)

```bash
npm run deploy:web
```

- [ ] **Step 4: Smoke**

`GET /api/players` — factor grades may include `elite`/`critical`; known counts unchanged; draftScore moves vs pre-change (expected).

- [ ] **Step 5: Commit only if deploy scripts/docs notes changed; otherwise no commit**

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| FactorGrade elite/critical | 1 |
| Weights + CEILING_RANGE ±5 | 1 |
| Volume/rank band tables | 1 |
| Categoricals four-color | 1 |
| Spot-check rebaseline | 2 |
| Calibration volume-only | 3 |
| UI tokens/labels | 4 |
| Eval doc + canvas | 5 |
| Worker (+ web) deploy | 6 |

## Self-review notes

- `gradeFactor` signature change is breaking for internal callers — update all call sites in Task 1.
- Current `DEFAULT_GRADING_BANDS` only has three fields; red is currently “below orange.” Spec adds `redMin` + `eliteMin`.
- Canvas lives outside the DraftLab git repo; Task 5 must still edit it.
- Do not preserve legacy Allen ceiling=41 under new weights.
- Keep draft need-level “critical” CSS distinct from factor-grade critical.

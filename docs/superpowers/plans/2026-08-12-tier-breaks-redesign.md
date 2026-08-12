# Tier Breaks Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the board's fixed-percentile tier cuts and the cheat sheet's min-max tiers with one shared set of pure functions, so survival bands own the horizontal rule while scoring cliffs, quality grades, and replacement level each get their own visual channel.

**Architecture:** A new leaf package `@draftlab/tiers` holds four independent pure functions plus two relocated helpers. `apps/api` and `apps/web` both import it, replacing two divergent implementations — one previously trapped inside an Angular component, one in `strategy-engine`. Board sections come from survival bands; quality and replacement render as per-row chips that never depend on the visible pool.

**Tech Stack:** TypeScript 5.9, npm workspaces (npm@11.8.0), vitest 4, Angular 21 (signals, standalone components), Node ESM (`"type": "module"`, `.js` import specifiers).

**Spec:** `docs/superpowers/specs/2026-08-12-tier-breaks-redesign-design.md`

**Branch:** `feature/tier-breaks-redesign`

## Global Constraints

- All packages are ESM: `"type": "module"`. **Relative imports must carry a `.js` extension** (`./types.js`), even from `.ts` source. This is existing repo convention — TypeScript resolves it, the compiler emits it.
- Package `tsconfig.json` extends `../../tsconfig.base.json`, sets `outDir: "dist"`, `rootDir: "src"`, and declares `references` for each workspace dependency.
- Tests live in `src/__tests__/*.test.ts` and run with `vitest run`.
- Every new workspace package must be added to the root `package.json` `build`, `build:packages`, `test`, and `test:engines` scripts, or CI will not build or test it.
- Lint is `prettier --check .` from the repo root. Run it before each commit.
- `draftScore` is already position-normalised upstream (`normaliseCeiling` scales against `CEILING_RANGE[position]`, `packages/evaluation-engine/src/draft-score.ts:25-29`). **Never re-normalise by position** in this work.
- Scores passed to `detectCliffs` must be sorted **descending**. The function documents this and does not sort defensively.
- Do not commit to `main`. All work lands on `feature/tier-breaks-redesign`.

---

## File Structure

| File                                     | Responsibility                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/tiers/package.json`            | Workspace manifest; depends only on `@draftlab/domain`.                                   |
| `packages/tiers/tsconfig.json`           | Build config; references `../domain`.                                                     |
| `packages/tiers/src/types.ts`            | Shared types: `TierRow`, `QualityBand`, `CliffMarker`, `SurvivalBand`, `ReplacementBand`. |
| `packages/tiers/src/quality.ts`          | `qualityBand` + thresholds.                                                               |
| `packages/tiers/src/cliffs.ts`           | `detectCliffs` + `DEFAULT_CLIFF_K`.                                                       |
| `packages/tiers/src/replacement.ts`      | `replacementBand`.                                                                        |
| `packages/tiers/src/survival.ts`         | `adpOverall`, relocated `estimateSurvivalProbability`, `survivalBands`.                   |
| `packages/tiers/src/cheat-sheet.ts`      | `buildCheatSheet` rebuilt on the shared functions.                                        |
| `packages/tiers/src/index.ts`            | Barrel re-export.                                                                         |
| `packages/tiers/src/__tests__/*.test.ts` | One suite per module.                                                                     |
| `scripts/inspect-cliffs.mts`             | Throwaway tuning harness (Task 5), deleted in the same task.                              |

---

## Task 1: Scaffold `@draftlab/tiers` and implement `qualityBand`

**Files:**

- Create: `packages/tiers/package.json`
- Create: `packages/tiers/tsconfig.json`
- Create: `packages/tiers/src/types.ts`
- Create: `packages/tiers/src/quality.ts`
- Create: `packages/tiers/src/index.ts`
- Create: `packages/tiers/src/__tests__/quality.test.ts`
- Modify: `package.json` (root, scripts)

**Interfaces:**

- Consumes: `Position`, `RosterShape` from `@draftlab/domain`.
- Produces: `QualityBand = 'S'|'A'|'B'|'C'|'D'`; `qualityBand(draftScore: number, ceilingKnownFactors: number): QualityBand | null`; `QUALITY_THRESHOLDS`; the `TierRow` interface used by every later task.

- [ ] **Step 1: Create the package manifest**

`packages/tiers/package.json`:

```json
{
  "name": "@draftlab/tiers",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@draftlab/domain": "*"
  },
  "devDependencies": {
    "typescript": "~5.9.2",
    "vitest": "^4.0.8"
  }
}
```

`packages/tiers/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../domain" }]
}
```

- [ ] **Step 2: Add the package to root scripts**

In the root `package.json`, add `-w @draftlab/tiers` to all four of `build`, `build:packages`, `test`, and `test:engines`.

Placement differs per script — `@draftlab/domain` appears in the build scripts but **not** in the test scripts:

- `build` and `build:packages`: insert immediately after `-w @draftlab/domain`, since tiers depends only on domain and must build early.
- `test` and `test:engines`: these start at `-w @draftlab/evaluation-engine`; insert `-w @draftlab/tiers` at the **front** of the list.

- [ ] **Step 3: Install so npm links the workspace**

Run: `npm install`
Expected: completes with `@draftlab/tiers` symlinked into root `node_modules/@draftlab/`.

- [ ] **Step 4: Write the shared types**

`packages/tiers/src/types.ts`:

```ts
import type { Position } from '@draftlab/domain';

/** Minimum a row must expose to be tiered, graded, or banded. */
export interface TierRow {
  id: string;
  position: Position;
  draftScore: number;
  /** How many ceiling factors are actually measured. 0 = no real signal. */
  ceilingKnownFactors: number;
  /** ADP in "round.pick" notation, e.g. "2.09". */
  adpRoundPick: string;
}

export type QualityBand = 'S' | 'A' | 'B' | 'C' | 'D';

/** A detected gap between two adjacent players in a descending score list. */
export interface CliffMarker {
  /** The cliff falls AFTER this index in the input array. */
  afterIndex: number;
  /** Absolute score gap, rounded to 1dp. */
  gap: number;
  /** How many times the baseline gap this is, rounded to 1dp. */
  multiple: number;
}

export type SurvivalBandId = 'gone' | 'coin-flip' | 'available' | 'adp-unknown';

export interface SurvivalBand<T extends TierRow = TierRow> {
  id: SurvivalBandId;
  label: string;
  rows: T[];
}

export interface SurvivalCuts {
  /** Below this probability → 'gone'. */
  gone: number;
  /** Below this probability → 'coin-flip'; at or above → 'available'. */
  coinFlip: number;
}

export interface ReplacementBand {
  /** 'RB1' | 'RB2' | 'FLEX' | 'BENCH' etc. */
  id: string;
  label: string;
}
```

- [ ] **Step 5: Write the failing test**

`packages/tiers/src/__tests__/quality.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { qualityBand, QUALITY_THRESHOLDS } from '../quality.js';

describe('qualityBand', () => {
  it('assigns bands from absolute draftScore thresholds', () => {
    expect(qualityBand(92, 5)).toBe('S');
    expect(qualityBand(80, 5)).toBe('A');
    expect(qualityBand(65, 5)).toBe('B');
    expect(qualityBand(50, 5)).toBe('C');
    expect(qualityBand(20, 5)).toBe('D');
  });

  it('treats each threshold as inclusive', () => {
    expect(qualityBand(QUALITY_THRESHOLDS.S, 5)).toBe('S');
    expect(qualityBand(QUALITY_THRESHOLDS.S - 0.1, 5)).toBe('A');
    expect(qualityBand(QUALITY_THRESHOLDS.A, 5)).toBe('A');
    expect(qualityBand(QUALITY_THRESHOLDS.B, 5)).toBe('B');
    expect(qualityBand(QUALITY_THRESHOLDS.C, 5)).toBe('C');
    expect(qualityBand(QUALITY_THRESHOLDS.C - 0.1, 5)).toBe('D');
  });

  it('returns null for zero-known-factor players regardless of score', () => {
    // A mostly-generic draftScore is not a judgment — it must not earn a letter.
    expect(qualityBand(99, 0)).toBeNull();
    expect(qualityBand(10, 0)).toBeNull();
  });

  it('does not vary by pool — the same score always yields the same band', () => {
    const first = qualityBand(76, 3);
    const second = qualityBand(76, 12);
    expect(first).toBe(second);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test -w @draftlab/tiers`
Expected: FAIL — cannot resolve `../quality.js`.

- [ ] **Step 7: Implement `qualityBand`**

`packages/tiers/src/quality.ts`:

```ts
import type { QualityBand } from './types.js';

/**
 * Absolute cut-points on the 0-100 draftScore. ONE global set, not per-position:
 * draftScore is already position-normalised upstream (normaliseCeiling scales
 * against CEILING_RANGE[position] in evaluation-engine/draft-score.ts), and the
 * archetype, value and risk components are position-agnostic. Re-normalising here
 * would double-apply that correction.
 *
 * Starting values from the design doc — confirm against the real score
 * distribution before treating them as settled.
 */
export const QUALITY_THRESHOLDS = {
  S: 85,
  A: 75,
  B: 62,
  C: 48,
} as const;

/**
 * Grade a player on intrinsic quality alone. Deliberately independent of the
 * visible pool: filtering to one position, or players coming off the board, must
 * never change a grade.
 *
 * Returns null when no ceiling factor is actually measured — the underlying
 * draftScore is then mostly generic defaults, so a letter would overstate it.
 */
export function qualityBand(draftScore: number, ceilingKnownFactors: number): QualityBand | null {
  if (ceilingKnownFactors === 0) return null;
  if (draftScore >= QUALITY_THRESHOLDS.S) return 'S';
  if (draftScore >= QUALITY_THRESHOLDS.A) return 'A';
  if (draftScore >= QUALITY_THRESHOLDS.B) return 'B';
  if (draftScore >= QUALITY_THRESHOLDS.C) return 'C';
  return 'D';
}
```

`packages/tiers/src/index.ts`:

```ts
export * from './types.js';
export * from './quality.js';
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test -w @draftlab/tiers`
Expected: PASS, 4 tests.

- [ ] **Step 9: Verify the package builds**

Run: `npm run build -w @draftlab/tiers`
Expected: exit 0, `packages/tiers/dist/index.js` and `index.d.ts` created.

- [ ] **Step 10: Commit**

```bash
npx prettier --write packages/tiers package.json
git add packages/tiers package.json package-lock.json
git commit -m "feat(tiers): scaffold @draftlab/tiers with absolute quality bands"
```

---

## Task 2: `detectCliffs`

**Files:**

- Create: `packages/tiers/src/cliffs.ts`
- Create: `packages/tiers/src/__tests__/cliffs.test.ts`
- Modify: `packages/tiers/src/index.ts`

**Interfaces:**

- Consumes: `CliffMarker` from `./types.js` (Task 1).
- Produces: `detectCliffs(scores: number[], k?: number): CliffMarker[]`; `DEFAULT_CLIFF_K: number`.

- [ ] **Step 1: Write the failing test**

`packages/tiers/src/__tests__/cliffs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectCliffs, DEFAULT_CLIFF_K } from '../cliffs.js';

describe('detectCliffs', () => {
  it('flags a gap that is k times the median gap', () => {
    // gaps: 1, 1, 8, 1  → median 1 → threshold 2.5 → only the 8 qualifies
    const cliffs = detectCliffs([50, 49, 48, 40, 39]);
    expect(cliffs).toHaveLength(1);
    expect(cliffs[0]!.afterIndex).toBe(2);
    expect(cliffs[0]!.gap).toBe(8);
    expect(cliffs[0]!.multiple).toBe(8);
  });

  it('finds nothing in a uniformly spaced list', () => {
    expect(detectCliffs([50, 45, 40, 35, 30])).toEqual([]);
  });

  it('scales to the data rather than using an absolute cut-off', () => {
    // Same shape as the first case, but compressed 10x. A fixed point threshold
    // would miss this entirely; the median rule must still find it.
    const cliffs = detectCliffs([5.0, 4.9, 4.8, 4.0, 3.9]);
    expect(cliffs).toHaveLength(1);
    expect(cliffs[0]!.afterIndex).toBe(2);
  });

  it('returns no cliffs when every score is identical', () => {
    expect(detectCliffs([40, 40, 40, 40])).toEqual([]);
  });

  it('falls back to the mean of nonzero gaps when the median gap is zero', () => {
    // gaps: 0, 0, 0, 9 → median 0, so the median rule would divide by zero.
    // Mean of nonzero gaps = 9 → threshold 22.5 → 9 does not clear it.
    const cliffs = detectCliffs([40, 40, 40, 40, 31]);
    expect(cliffs).toEqual([]);
    // With a low k the same gap does clear the fallback threshold.
    const sensitive = detectCliffs([40, 40, 40, 40, 31], 0.5);
    expect(sensitive).toHaveLength(1);
    expect(sensitive[0]!.afterIndex).toBe(3);
  });

  it('handles degenerate input', () => {
    expect(detectCliffs([])).toEqual([]);
    expect(detectCliffs([42])).toEqual([]);
  });

  it('accepts a custom k', () => {
    const strict = detectCliffs([50, 49, 48, 40, 39], 20);
    expect(strict).toEqual([]);
  });

  it('exposes a documented default k', () => {
    expect(DEFAULT_CLIFF_K).toBe(2.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @draftlab/tiers`
Expected: FAIL — cannot resolve `../cliffs.js`.

- [ ] **Step 3: Implement `detectCliffs`**

`packages/tiers/src/cliffs.ts`:

```ts
import type { CliffMarker } from './types.js';

/**
 * How many times the baseline gap an adjacent gap must be to count as a cliff.
 * Starting value from the design doc; confirm by inspecting where cliffs land on
 * real data before treating it as settled.
 */
export const DEFAULT_CLIFF_K = 2.5;

const round1 = (n: number) => Math.round(n * 10) / 10;

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Find genuine dropoffs in a DESCENDING-sorted score list.
 *
 * A fixed point threshold is unusable on draftScore: it is a weighted blend, so
 * adjacent gaps are tiny in the crowded middle of the distribution and large in
 * the sparse tails. An absolute cut-off fires constantly at the tails and never
 * in the middle. Comparing each gap against the MEDIAN gap self-scales; the
 * median specifically (rather than a mean or z-score) keeps a few huge tail gaps
 * from inflating the threshold and masking real mid-board cliffs.
 *
 * @param scores Descending-sorted scores. Not sorted defensively — callers own order.
 * @param k Multiple of the baseline gap required to flag a cliff.
 */
export function detectCliffs(scores: number[], k: number = DEFAULT_CLIFF_K): CliffMarker[] {
  if (scores.length < 2) return [];

  const gaps: number[] = [];
  for (let i = 0; i < scores.length - 1; i++) {
    gaps.push(scores[i]! - scores[i + 1]!);
  }

  let baseline = median([...gaps].sort((a, b) => a - b));

  if (baseline === 0) {
    // More than half the gaps are ties. k * 0 would make every nonzero gap a
    // cliff, so fall back to the mean of the gaps that do exist.
    const nonZero = gaps.filter((g) => g > 0);
    if (nonZero.length === 0) return [];
    baseline = nonZero.reduce((sum, g) => sum + g, 0) / nonZero.length;
  }

  const threshold = k * baseline;
  const cliffs: CliffMarker[] = [];
  gaps.forEach((gap, index) => {
    if (gap > 0 && gap >= threshold) {
      cliffs.push({ afterIndex: index, gap: round1(gap), multiple: round1(gap / baseline) });
    }
  });
  return cliffs;
}
```

Add to `packages/tiers/src/index.ts`:

```ts
export * from './cliffs.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @draftlab/tiers`
Expected: PASS, 12 tests total.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/tiers
git add packages/tiers
git commit -m "feat(tiers): add median-gap cliff detection"
```

---

## Task 3: `replacementBand`

**Files:**

- Create: `packages/tiers/src/replacement.ts`
- Create: `packages/tiers/src/__tests__/replacement.test.ts`
- Modify: `packages/tiers/src/index.ts`

**Interfaces:**

- Consumes: `ReplacementBand` from `./types.js`; `Position`, `RosterShape` from `@draftlab/domain`.
- Produces: `replacementBand(positionRank: number, position: Position, roster: RosterShape, teamCount: number): ReplacementBand`.

`RosterShape` (from `packages/domain/src/index.ts:240-249`) is `{ qb, rb, wr, te, flex, superflex, bench, totalStarters }`.

- [ ] **Step 1: Write the failing test**

`packages/tiers/src/__tests__/replacement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RosterShape } from '@draftlab/domain';
import { replacementBand } from '../replacement.js';

const roster: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  bench: 6,
  totalStarters: 7,
};

describe('replacementBand', () => {
  it('splits starter slots into one band per slot index', () => {
    // 12 teams x 2 RB slots → ranks 1-12 are RB1, 13-24 are RB2.
    expect(replacementBand(1, 'RB', roster, 12).id).toBe('RB1');
    expect(replacementBand(12, 'RB', roster, 12).id).toBe('RB1');
    expect(replacementBand(13, 'RB', roster, 12).id).toBe('RB2');
    expect(replacementBand(24, 'RB', roster, 12).id).toBe('RB2');
  });

  it('places players past the starter bands into flex', () => {
    // 24 starter RB slots + 12 flex slots → ranks 25-36 are FLEX.
    expect(replacementBand(25, 'RB', roster, 12).id).toBe('FLEX');
    expect(replacementBand(36, 'RB', roster, 12).id).toBe('FLEX');
  });

  it('places players past flex onto the bench', () => {
    expect(replacementBand(37, 'RB', roster, 12).id).toBe('BENCH');
    expect(replacementBand(200, 'RB', roster, 12).id).toBe('BENCH');
  });

  it('does not grant flex eligibility to QB', () => {
    // 1 QB slot x 12 teams → rank 13 is already bench, not flex.
    expect(replacementBand(12, 'QB', roster, 12).id).toBe('QB1');
    expect(replacementBand(13, 'QB', roster, 12).id).toBe('BENCH');
  });

  it('extends QB bands by superflex slots', () => {
    const superflexRoster: RosterShape = { ...roster, superflex: 1 };
    // 1 QB + 1 superflex = 2 QB bands → rank 13 is QB2, not bench.
    expect(replacementBand(13, 'QB', superflexRoster, 12).id).toBe('QB2');
    expect(replacementBand(24, 'QB', superflexRoster, 12).id).toBe('QB2');
    expect(replacementBand(25, 'QB', superflexRoster, 12).id).toBe('BENCH');
  });

  it('scales with team count', () => {
    expect(replacementBand(11, 'RB', roster, 10).id).toBe('RB2');
    expect(replacementBand(11, 'RB', roster, 12).id).toBe('RB1');
  });

  it('is independent of the visible pool — rank alone determines the band', () => {
    expect(replacementBand(5, 'WR', roster, 12).id).toBe('WR1');
    expect(replacementBand(5, 'WR', roster, 12).label).toBe('WR1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @draftlab/tiers`
Expected: FAIL — cannot resolve `../replacement.js`.

- [ ] **Step 3: Implement `replacementBand`**

`packages/tiers/src/replacement.ts`:

```ts
import type { Position, RosterShape } from '@draftlab/domain';
import type { ReplacementBand } from './types.js';

const FLEX_ELIGIBLE: readonly Position[] = ['RB', 'WR', 'TE'];

/** Starter slots per team at this position, including superflex for QB. */
function starterSlotsPerTeam(position: Position, roster: RosterShape): number {
  switch (position) {
    case 'QB':
      return roster.qb + roster.superflex;
    case 'RB':
      return roster.rb;
    case 'WR':
      return roster.wr;
    case 'TE':
      return roster.te;
    default:
      return 0;
  }
}

/**
 * Which roster slot a player's positional rank realistically fills in THIS league.
 *
 * Band i covers ranks (i-1)*teamCount+1 .. i*teamCount, for i up to the number of
 * starter slots at the position. So in a 12-team, 2-RB league, RB ranks 1-12 are
 * RB1 and 13-24 are RB2. Past the starter bands come flex (for flex-eligible
 * positions only), then bench.
 *
 * Depends only on league shape, never on who is still available, so a player's
 * band does not move as the draft progresses.
 */
export function replacementBand(
  positionRank: number,
  position: Position,
  roster: RosterShape,
  teamCount: number,
): ReplacementBand {
  const starterSlots = starterSlotsPerTeam(position, roster);
  const starterCapacity = starterSlots * teamCount;

  if (positionRank <= starterCapacity) {
    const bandIndex = Math.ceil(positionRank / teamCount);
    const id = `${position}${bandIndex}`;
    return { id, label: id };
  }

  const flexCapacity = FLEX_ELIGIBLE.includes(position) ? roster.flex * teamCount : 0;
  if (positionRank <= starterCapacity + flexCapacity) {
    return { id: 'FLEX', label: 'FLEX' };
  }

  return { id: 'BENCH', label: 'BENCH' };
}
```

Add to `packages/tiers/src/index.ts`:

```ts
export * from './replacement.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @draftlab/tiers`
Expected: PASS, 19 tests total.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/tiers
git add packages/tiers
git commit -m "feat(tiers): add positional replacement bands from roster shape"
```

---

## Task 4: Relocate the survival estimator and add `survivalBands`

Moving `estimateSurvivalProbability` out of `recommendation-engine` keeps `@draftlab/tiers` a leaf package (domain-only dependency), which is what lets the Angular app import it without dragging engine code toward the browser bundle. It has exactly one internal consumer.

**Files:**

- Create: `packages/tiers/src/survival.ts`
- Create: `packages/tiers/src/__tests__/survival.test.ts`
- Modify: `packages/tiers/src/index.ts`
- Modify: `packages/recommendation-engine/src/scarcity.ts` (remove `SurvivalInput` + `estimateSurvivalProbability`)
- Modify: `packages/recommendation-engine/src/recommend.ts:18` (import from `@draftlab/tiers`)
- Modify: `packages/recommendation-engine/src/__tests__/recommend.test.ts:4,129-140`
- Modify: `packages/recommendation-engine/package.json` (add dependency)
- Modify: `packages/recommendation-engine/tsconfig.json` (add reference)

**Interfaces:**

- Consumes: `TierRow`, `SurvivalBand`, `SurvivalCuts` from `./types.js` (Task 1).
- Produces: `adpOverall(adpRoundPick: string, teamCount: number): number | null`; `estimateSurvivalProbability(input: SurvivalInput): number`; `SurvivalInput`; `survivalBands<T extends TierRow>(rows: T[], nextPickOverall: number, picksUntilNext: number, teamCount: number, cuts?: SurvivalCuts): SurvivalBand<T>[]`; `SURVIVAL_CUTS`.

- [ ] **Step 1: Write the failing test**

`packages/tiers/src/__tests__/survival.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TierRow } from '../types.js';
import { adpOverall, estimateSurvivalProbability, survivalBands } from '../survival.js';

const row = (id: string, adpRoundPick: string): TierRow => ({
  id,
  position: 'RB',
  draftScore: 70,
  ceilingKnownFactors: 5,
  adpRoundPick,
});

describe('adpOverall', () => {
  it('converts round.pick notation to an overall pick number', () => {
    expect(adpOverall('1.01', 12)).toBe(1);
    expect(adpOverall('1.12', 12)).toBe(12);
    expect(adpOverall('2.01', 12)).toBe(13);
    expect(adpOverall('3.05', 10)).toBe(25);
  });

  it('returns null for unparseable input rather than a late-round sentinel', () => {
    // The old 999 sentinel silently read as "very late", fabricating a survival
    // claim for players we have no ADP for at all.
    expect(adpOverall('', 12)).toBeNull();
    expect(adpOverall('n/a', 12)).toBeNull();
    expect(adpOverall('12', 12)).toBeNull();
  });
});

describe('survivalBands', () => {
  it('separates players by survival probability into three bands', () => {
    const rows = [row('early', '1.01'), row('near', '2.09'), row('late', '9.01')];
    const bands = survivalBands(rows, 21, 8, 12);
    const idsIn = (bandId: string) =>
      bands.find((b) => b.id === bandId)?.rows.map((r) => r.id) ?? [];

    expect(idsIn('gone')).toContain('early');
    expect(idsIn('available')).toContain('late');
  });

  it('routes unparseable ADP to its own band, never to available', () => {
    const rows = [row('known', '1.01'), row('unknown', '—')];
    const bands = survivalBands(rows, 21, 8, 12);
    const unknownBand = bands.find((b) => b.id === 'adp-unknown');

    expect(unknownBand?.rows.map((r) => r.id)).toEqual(['unknown']);
    expect(bands.find((b) => b.id === 'available')?.rows ?? []).not.toContainEqual(
      expect.objectContaining({ id: 'unknown' }),
    );
  });

  it('omits empty bands', () => {
    const bands = survivalBands([row('a', '1.01')], 21, 8, 12);
    expect(bands.every((b) => b.rows.length > 0)).toBe(true);
  });

  it('preserves input order within a band', () => {
    const rows = [row('a', '9.01'), row('b', '9.02'), row('c', '9.03')];
    const bands = survivalBands(rows, 21, 8, 12);
    const available = bands.find((b) => b.id === 'available');
    expect(available?.rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns no bands for an empty pool', () => {
    expect(survivalBands([], 21, 8, 12)).toEqual([]);
  });

  it('handles being on the clock', () => {
    const bands = survivalBands([row('a', '1.01')], 1, 0, 12);
    expect(bands.length).toBeGreaterThan(0);
  });
});

describe('estimateSurvivalProbability (relocated, behaviour unchanged)', () => {
  it('rates a later ADP as more likely to survive than an earlier one', () => {
    const early = estimateSurvivalProbability({
      adpOverall: 5,
      nextUserPickOverall: 20,
      picksUntilNext: 10,
    });
    const late = estimateSurvivalProbability({
      adpOverall: 40,
      nextUserPickOverall: 20,
      picksUntilNext: 10,
    });
    expect(late).toBeGreaterThan(early);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @draftlab/tiers`
Expected: FAIL — cannot resolve `../survival.js`.

- [ ] **Step 3: Create `survival.ts`, moving the estimator verbatim**

Copy `SurvivalInput` and `estimateSurvivalProbability` from `packages/recommendation-engine/src/scarcity.ts:33-63` **without changing their logic** — this is a relocation, not a rewrite. Then add `adpOverall` and `survivalBands` below.

`packages/tiers/src/survival.ts`:

```ts
import type { SurvivalBand, SurvivalCuts, TierRow } from './types.js';

export interface SurvivalInput {
  /** Player ADP as overall pick number (1-based). */
  adpOverall: number;
  /** Overall pick number of the user's next selection. */
  nextUserPickOverall: number;
  /** Picks remaining before that selection (0 = on the clock). */
  picksUntilNext: number;
  /** 0–1 boost when a position run is draining this player's position faster than ADP. */
  positionRunFactor?: number;
}

/**
 * Rough P(player still available at the user's next pick).
 * Used on live-draft recommendation cards — not a full Monte Carlo.
 *
 * Relocated verbatim from recommendation-engine/scarcity.ts so that @draftlab/tiers
 * stays a leaf package; recommendation-engine now imports it from here.
 */
export function estimateSurvivalProbability(input: SurvivalInput): number {
  const picksUntilNext = Math.max(0, input.picksUntilNext);
  const slack = input.adpOverall - input.nextUserPickOverall;
  // Near the next pick ADP → ~50%; later ADP → higher; earlier → lower.
  let p = 0.52 + slack / (2 * Math.max(8, picksUntilNext + 4));
  if (slack < -picksUntilNext) {
    p = 0.08 + Math.max(0, 0.12 + slack / 50);
  }
  if (picksUntilNext === 0) {
    // On the clock — survival-to-next-turn is about the pick AFTER this one.
    p = 0.45 + slack / 24;
  }
  const run = Math.min(1, Math.max(0, input.positionRunFactor ?? 0));
  p *= 1 - 0.35 * run;
  return Math.round(Math.min(0.92, Math.max(0.05, p)) * 100) / 100;
}

/**
 * Parse "round.pick" ADP into an overall pick number.
 *
 * Returns null — NOT a large sentinel — when the input is unusable. A sentinel
 * reads as "very late" downstream, which fabricates a survival claim for a player
 * whose ADP we simply do not have.
 */
export function adpOverall(adpRoundPick: string, teamCount: number): number | null {
  const match = /^(\d+)\.(\d+)$/.exec(adpRoundPick.trim());
  if (!match) return null;
  const round = Number(match[1]);
  const slot = Number(match[2]);
  if (!Number.isFinite(round) || !Number.isFinite(slot) || round < 1 || slot < 1) return null;
  return (round - 1) * teamCount + slot;
}

/** Starting cut-points from the design doc; confirm against real data. */
export const SURVIVAL_CUTS: SurvivalCuts = { gone: 0.25, coinFlip: 0.65 };

const BAND_LABELS = {
  gone: 'Gone before your next pick',
  'coin-flip': 'Coin flip',
  available: 'Should be there',
  'adp-unknown': 'ADP unknown',
} as const;

/**
 * Partition rows by how likely they are to survive to the user's next pick.
 *
 * This is the board's section partition: it answers "take now or wait", which is
 * the actual draft-day decision. Consequence accepted deliberately — the board is
 * no longer globally ranked by score, because bands follow ADP.
 *
 * picksUntilNext is passed in rather than derived: the caller owns draft state.
 */
export function survivalBands<T extends TierRow>(
  rows: T[],
  nextPickOverall: number,
  picksUntilNext: number,
  teamCount: number,
  cuts: SurvivalCuts = SURVIVAL_CUTS,
): SurvivalBand<T>[] {
  const buckets: Record<SurvivalBand['id'], T[]> = {
    gone: [],
    'coin-flip': [],
    available: [],
    'adp-unknown': [],
  };

  for (const row of rows) {
    const adp = adpOverall(row.adpRoundPick, teamCount);
    if (adp === null) {
      buckets['adp-unknown'].push(row);
      continue;
    }
    const p = estimateSurvivalProbability({
      adpOverall: adp,
      nextUserPickOverall: nextPickOverall,
      picksUntilNext,
    });
    if (p < cuts.gone) buckets.gone.push(row);
    else if (p < cuts.coinFlip) buckets['coin-flip'].push(row);
    else buckets.available.push(row);
  }

  const order: Array<SurvivalBand['id']> = ['gone', 'coin-flip', 'available', 'adp-unknown'];
  return order
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, label: BAND_LABELS[id], rows: buckets[id] }));
}
```

Add to `packages/tiers/src/index.ts`:

```ts
export * from './survival.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @draftlab/tiers`
Expected: PASS, 28 tests total.

- [ ] **Step 5: Remove the estimator from recommendation-engine and repoint its consumer**

In `packages/recommendation-engine/src/scarcity.ts`, delete the `SurvivalInput` interface and the `estimateSurvivalProbability` function (lines 33-63). Keep `ScarcityInput` and `scarcityUrgencyMultiplier` — those are about recommendation urgency, not tiering.

In `packages/recommendation-engine/src/recommend.ts:18`, change:

```ts
import { estimateSurvivalProbability, scarcityUrgencyMultiplier } from './scarcity.js';
```

to:

```ts
import { estimateSurvivalProbability } from '@draftlab/tiers';
import { scarcityUrgencyMultiplier } from './scarcity.js';
```

In `packages/recommendation-engine/src/__tests__/recommend.test.ts:4`, change the `estimateSurvivalProbability` import to come from `@draftlab/tiers`. Leave the existing assertions at lines 129-140 unchanged — behaviour did not change, so those tests must still pass exactly as written. **If they fail, the relocation altered behaviour and must be corrected — do not adjust the assertions.**

Add to `packages/recommendation-engine/package.json` dependencies:

```json
"@draftlab/tiers": "*"
```

Add to `packages/recommendation-engine/tsconfig.json` references:

```json
{ "path": "../tiers" }
```

- [ ] **Step 6: Reinstall and verify both packages**

Run: `npm install && npm run build:packages`
Expected: exit 0.

Run: `npm run test -w @draftlab/tiers -w @draftlab/recommendation-engine`
Expected: PASS. The pre-existing `estimateSurvivalProbability` tests in `recommend.test.ts` pass unmodified, confirming the move was behaviour-preserving.

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/tiers packages/recommendation-engine
git add packages/tiers packages/recommendation-engine package-lock.json
git commit -m "feat(tiers): add survival bands; relocate survival estimator into tiers"
```

---

## Task 5: Tune `k` and the thresholds against real artifact data

The working agreement calls this out directly: every real bug in this project produced _plausible output_ rather than an error, and none was caught by a test suite. A wrong `k` yields a board that looks entirely reasonable while marking the wrong places. This task exists to read the actual numbers before the defaults are treated as settled. It is not optional and it does not end with "tests pass".

Real data lives at `C:\Code\sleeperMCP\artifacts\player_factors.json` — 221 players, `schema_version` 5. `apps/api/src/data/load-artifact.ts` already parses exactly this file.

**Files:**

- Create (temporary): `scripts/inspect-cliffs.mts`
- Modify (only if the data says so): `packages/tiers/src/cliffs.ts`, `packages/tiers/src/quality.ts`
- Delete: `scripts/inspect-cliffs.mts` before committing

**Interfaces:**

- Consumes: `detectCliffs`, `DEFAULT_CLIFF_K`, `qualityBand`, `QUALITY_THRESHOLDS` from `@draftlab/tiers`.
- Produces: confirmed constants. No new API.

- [ ] **Step 1: Write the inspection harness**

`scripts/inspect-cliffs.mts`:

```ts
/**
 * Throwaway tuning harness. Prints the real draftScore distribution, where the
 * cliff detector fires at several k values, and how players spread across quality
 * bands. Read the output and judge it — delete this file afterwards.
 */
import { readFileSync } from 'node:fs';
import { detectCliffs, qualityBand, QUALITY_THRESHOLDS } from '@draftlab/tiers';
import { seedPlayersFromArtifact } from '../apps/api/src/data/load-artifact.js';
import { evaluatePlayer } from '@draftlab/evaluation-engine';

const ARTIFACT = 'C:\\Code\\sleeperMCP\\artifacts\\player_factors.json';

const raw = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
// seedPlayersFromArtifact returns { players: SeedPlayer[]; skipped: SkippedPlayer[] }.
const { players: seeds, skipped } = seedPlayersFromArtifact(raw);
console.log(`loaded ${seeds.length} players, skipped ${skipped.length}`);

const scored = seeds
  .map((s) => {
    const evaluation = evaluatePlayer({
      player: s.player,
      factors: s.factors,
      value: {
        fseRank: s.market.fseRank,
        espnProjectionRank: s.market.espnProjectionRank,
        projectedRank: s.market.projectedRank,
      },
      risk: s.risk,
    });
    return {
      name: s.player.name,
      position: s.player.position,
      draftScore: evaluation.draftScore,
      knownFactors: evaluation.ceiling.knownFactors,
    };
  })
  .filter((p) => p.knownFactors > 0)
  .sort((a, b) => b.draftScore - a.draftScore);

console.log(`players with measured data: ${scored.length}`);
console.log(`score range: ${scored.at(-1)!.draftScore} .. ${scored[0]!.draftScore}`);

const gaps: number[] = [];
for (let i = 0; i < scored.length - 1; i++)
  gaps.push(scored[i]!.draftScore - scored[i + 1]!.draftScore);
const sortedGaps = [...gaps].sort((a, b) => a - b);
console.log(`median gap: ${sortedGaps[Math.floor(sortedGaps.length / 2)]}`);
console.log(`max gap: ${sortedGaps.at(-1)}`);

console.log('\n--- quality band spread ---');
const bandCounts = new Map<string, number>();
for (const p of scored) {
  const band = qualityBand(p.draftScore, p.knownFactors) ?? 'null';
  bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
}
console.log(Object.fromEntries(bandCounts), 'thresholds:', QUALITY_THRESHOLDS);

for (const k of [1.5, 2.0, 2.5, 3.0, 4.0]) {
  const cliffs = detectCliffs(
    scored.map((p) => p.draftScore),
    k,
  );
  console.log(`\n--- k=${k}: ${cliffs.length} cliffs ---`);
  for (const c of cliffs.slice(0, 12)) {
    const above = scored[c.afterIndex]!;
    const below = scored[c.afterIndex + 1]!;
    console.log(
      `  after #${c.afterIndex + 1} ${above.name} (${above.draftScore}) → ${below.name} (${below.draftScore})  gap ${c.gap} (${c.multiple}x)`,
    );
  }
}

console.log('\n--- per position, k=2.5 ---');
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  const atPos = scored.filter((p) => p.position === pos);
  const cliffs = detectCliffs(atPos.map((p) => p.draftScore));
  console.log(
    `${pos}: ${atPos.length} players, ${cliffs.length} cliffs at ranks ${cliffs.map((c) => c.afterIndex + 1).join(', ') || '(none)'}`,
  );
}
```

- [ ] **Step 2: Run the harness and READ the output**

Run: `npx tsx scripts/inspect-cliffs.mts`

If `tsx` is unavailable, run `npm run build:packages` first and execute the compiled equivalent — the point is the output, not the runner.

Expected: the script prints. Now judge it against these questions, writing the answers into the commit message:

1. **Does the score range look sane?** A 0–100 blend across 221 players should span a wide chunk of that range. If everything sits in a 6-point band, the cliff detector has almost nothing to work with and `k` matters far less than that finding does — report it.
2. **At `k=2.5`, how many cliffs fire overall?** Roughly 3–8 across a full board is useful. 0 means the rule never fires and the marker is dead UI. 40 means every other row is a "cliff" and the marker is noise.
3. **Do the top cliffs land where a human would put them?** This is the real test. Look at the named players either side of each break. A cliff between the clear elite tier and everyone else should appear. A cliff in the middle of an obviously flat stretch is a red flag.
4. **Is the quality band spread reasonable?** If 200 of 221 players are `D`, or if nothing is `S`, the thresholds are wrong for the actual distribution — adjust `QUALITY_THRESHOLDS` and say so.
5. **Do per-position cliffs fire at all?** The board filters by position, and the detector runs within survival bands, so it must still work on smaller lists.

- [ ] **Step 3: Adjust the constants if the data says so**

Change `DEFAULT_CLIFF_K` in `packages/tiers/src/cliffs.ts` and/or `QUALITY_THRESHOLDS` in `packages/tiers/src/quality.ts` to whatever the output justifies. Update the doc comments to state the value was confirmed against 221 real players rather than assumed.

If you change `QUALITY_THRESHOLDS`, the boundary assertions in `quality.test.ts` reference the exported constants rather than literals, so they continue to hold. The four explicit-value assertions in the first test (`qualityBand(92, 5)` etc.) may need their inputs adjusted to stay inside the intended bands — that is a legitimate update to keep a test meaningful, not a loosened assertion.

- [ ] **Step 4: Confirm the suite still passes**

Run: `npm run test -w @draftlab/tiers`
Expected: PASS.

- [ ] **Step 5: Delete the harness and commit**

The harness reads an absolute path outside the repo and depends on a local sleeperMCP checkout. It must not ship.

```bash
rm scripts/inspect-cliffs.mts
npx prettier --write packages/tiers
git add packages/tiers
git commit -m "fix(tiers): confirm cliff k and quality thresholds against 221 real players

<record the actual numbers here: score range, median gap, cliff count at the
chosen k, the named players either side of the top 3 cliffs, and the band spread>"
```

---

## Task 6: Rebuild the cheat sheet on the shared functions

**Files:**

- Create: `packages/tiers/src/cheat-sheet.ts`
- Create: `packages/tiers/src/__tests__/cheat-sheet.test.ts`
- Modify: `packages/tiers/src/index.ts`
- Delete: `packages/strategy-engine/src/tiers.ts`
- Modify: `packages/strategy-engine/src/index.ts:7` (drop the `./tiers.js` export)
- Modify: `packages/strategy-engine/src/__tests__/simulate.test.ts:1-3,99-140` (remove migrated tests)
- Modify: `apps/api/src/services/store.ts:44,647`
- Modify: `apps/api/package.json`, `apps/api/tsconfig.json`

**Interfaces:**

- Consumes: `qualityBand` (Task 1), `detectCliffs` (Task 2), `TierRow`, `QualityBand` (Task 1).
- Produces: `buildCheatSheet(players: CheatSheetPlayer[]): CheatSheetGroup[]` where `CheatSheetPlayer extends TierRow` adds `name`, `ceilingScore`, `provisional`, `target?`, `avoid?`; `CheatSheetGroup = { position, tiers: CheatSheetTier[] }`; `CheatSheetTier = { tier: QualityBand, label: string, players: CheatSheetPlayer[] }`.

Note there is **no `unranked` field** — that is the deliberate removal from the spec. No-data players now appear inside the tier list with a `null` band.

- [ ] **Step 1: Write the failing test**

`packages/tiers/src/__tests__/cheat-sheet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCheatSheet, type CheatSheetPlayer } from '../cheat-sheet.js';

const player = (over: Partial<CheatSheetPlayer> & { id: string }): CheatSheetPlayer => ({
  name: over.id,
  position: 'WR',
  draftScore: 70,
  ceilingScore: 10,
  provisional: false,
  ceilingKnownFactors: 5,
  adpRoundPick: '1.01',
  ...over,
});

describe('buildCheatSheet', () => {
  it('groups players by position', () => {
    const sheet = buildCheatSheet([
      player({ id: 'wr1', position: 'WR' }),
      player({ id: 'rb1', position: 'RB' }),
    ]);
    expect(
      sheet.every((g) => g.tiers.every((t) => t.players.every((p) => p.position === g.position))),
    ).toBe(true);
  });

  it('uses absolute bands, so a thin position gets no S tier', () => {
    // Best TE scores 71 — a B under the global thresholds. The old min-max
    // implementation promoted each position's best player to the top tier by
    // construction; that is exactly the behaviour being removed.
    const sheet = buildCheatSheet([
      player({ id: 'te1', position: 'TE', draftScore: 71 }),
      player({ id: 'te2', position: 'TE', draftScore: 60 }),
      player({ id: 'te3', position: 'TE', draftScore: 55 }),
    ]);
    const te = sheet.find((g) => g.position === 'TE')!;
    expect(te.tiers.map((t) => t.tier)).not.toContain('S');
  });

  it('gives the same score the same band across positions', () => {
    const sheet = buildCheatSheet([
      player({ id: 'wr', position: 'WR', draftScore: 78 }),
      player({ id: 'rb', position: 'RB', draftScore: 78 }),
    ]);
    const bandOf = (pos: string, id: string) =>
      sheet.find((g) => g.position === pos)!.tiers.find((t) => t.players.some((p) => p.id === id))!
        .tier;
    expect(bandOf('WR', 'wr')).toBe(bandOf('RB', 'rb'));
  });

  it('keeps no-data players in the list instead of a separate unranked section', () => {
    const sheet = buildCheatSheet([
      player({ id: 'measured', position: 'WR', draftScore: 80 }),
      player({ id: 'nodata', position: 'WR', draftScore: 999, ceilingKnownFactors: 0 }),
    ]);
    const wr = sheet.find((g) => g.position === 'WR')!;
    const allIds = wr.tiers.flatMap((t) => t.players.map((p) => p.id));
    expect(allIds).toContain('nodata');
    expect(wr).not.toHaveProperty('unranked');
  });

  it('does not let a no-data player change a measured player band', () => {
    // The old min-max implementation had an inflated no-data score stretch the
    // range and shift everyone else. Absolute bands make that structurally
    // impossible — this test pins that property.
    const without = buildCheatSheet([player({ id: 'measured', draftScore: 80 })]);
    const withNoData = buildCheatSheet([
      player({ id: 'measured', draftScore: 80 }),
      player({ id: 'nodata', draftScore: 999, ceilingKnownFactors: 0 }),
    ]);
    const bandOf = (sheet: ReturnType<typeof buildCheatSheet>) =>
      sheet
        .find((g) => g.position === 'WR')!
        .tiers.find((t) => t.players.some((p) => p.id === 'measured'))!.tier;
    expect(bandOf(withNoData)).toBe(bandOf(without));
  });

  it('omits positions with no players and tiers with no members', () => {
    const sheet = buildCheatSheet([player({ id: 'wr1', position: 'WR' })]);
    expect(sheet.every((g) => g.tiers.every((t) => t.players.length > 0))).toBe(true);
  });

  it('sorts players by draftScore within a tier', () => {
    const sheet = buildCheatSheet([
      player({ id: 'low', draftScore: 63 }),
      player({ id: 'high', draftScore: 70 }),
    ]);
    const wr = sheet.find((g) => g.position === 'WR')!;
    expect(wr.tiers[0]!.players.map((p) => p.id)).toEqual(['high', 'low']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @draftlab/tiers`
Expected: FAIL — cannot resolve `../cheat-sheet.js`.

- [ ] **Step 3: Implement `cheat-sheet.ts`**

```ts
import type { Position } from '@draftlab/domain';
import { qualityBand } from './quality.js';
import type { QualityBand, TierRow } from './types.js';

export interface CheatSheetPlayer extends TierRow {
  name: string;
  ceilingScore: number | null;
  provisional: boolean;
  target?: boolean;
  avoid?: boolean;
}

export interface CheatSheetTier {
  tier: QualityBand;
  label: string;
  players: CheatSheetPlayer[];
}

export interface CheatSheetGroup {
  position: Position;
  tiers: CheatSheetTier[];
}

const TIER_ORDER: Array<{ tier: QualityBand; label: string }> = [
  { tier: 'S', label: 'Elite' },
  { tier: 'A', label: 'High' },
  { tier: 'B', label: 'Solid' },
  { tier: 'C', label: 'Depth' },
  { tier: 'D', label: 'Speculative' },
];

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

/**
 * Positional cheat sheet built on absolute quality bands.
 *
 * The grouping is still per position, but the LETTERS are global: a position with
 * no genuinely elite players shows no S tier, rather than promoting its best
 * available player by construction as the previous min-max implementation did.
 *
 * There is no separate `unranked` list. No-data players stay in the sheet with a
 * D band, because absolute bands mean they can no longer distort anyone else's
 * grade — the reason the old implementation had to segregate them.
 */
export function buildCheatSheet(players: CheatSheetPlayer[]): CheatSheetGroup[] {
  return POSITIONS.map((position) => {
    const atPosition = players
      .filter((p) => p.position === position)
      .sort((a, b) => b.draftScore - a.draftScore);

    const buckets = new Map<QualityBand, CheatSheetPlayer[]>();
    for (const player of atPosition) {
      const band = qualityBand(player.draftScore, player.ceilingKnownFactors) ?? 'D';
      const list = buckets.get(band) ?? [];
      list.push(player);
      buckets.set(band, list);
    }

    const tiers = TIER_ORDER.filter(({ tier }) => (buckets.get(tier)?.length ?? 0) > 0).map(
      ({ tier, label }) => ({ tier, label, players: buckets.get(tier)! }),
    );

    return { position, tiers };
  }).filter((group) => group.tiers.length > 0);
}
```

Add to `packages/tiers/src/index.ts`:

```ts
export * from './cheat-sheet.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w @draftlab/tiers`
Expected: PASS, 35 tests total.

- [ ] **Step 5: Delete the old implementation and its tests**

Delete `packages/strategy-engine/src/tiers.ts`. Remove `export * from './tiers.js';` from `packages/strategy-engine/src/index.ts:7`.

In `packages/strategy-engine/src/__tests__/simulate.test.ts`, delete the entire `describe('buildCheatSheet', ...)` block (lines 99-140) and remove `buildCheatSheet` from the import on line 3. Those tests were rewritten against the new semantics in Step 1 — **the old assertions are not carried over, because the output changed on purpose.** In particular, the old `unranked` assertion no longer describes intended behaviour.

- [ ] **Step 6: Repoint the API**

`apps/api/package.json` dependencies — add:

```json
"@draftlab/tiers": "*"
```

`apps/api/tsconfig.json` references — add:

```json
{ "path": "../../packages/tiers" }
```

In `apps/api/src/services/store.ts`, remove `buildCheatSheet` from the `@draftlab/strategy-engine` import at line 44 and import it from `@draftlab/tiers` instead. The `cheatSheet()` method body at lines 632-647 needs no change — it already builds objects carrying `id`, `name`, `position`, `draftScore`, `ceilingScore`, `provisional`, `ceilingKnownFactors`, `adpRoundPick`, `target`, `avoid`, which satisfies `CheatSheetPlayer`.

- [ ] **Step 7: Verify the whole workspace builds and tests**

Run: `npm install && npm run build:packages`
Expected: exit 0. A TypeScript error here means a consumer still imports the deleted module — fix the import, do not restore the file.

Run: `npm test`
Expected: PASS across all packages.

- [ ] **Step 8: Commit**

```bash
npx prettier --write packages apps/api
git add packages apps/api package-lock.json
git commit -m "refactor(tiers): rebuild cheat sheet on shared bands, delete min-max implementation"
```

---

## Task 7: Replace the board's percentile sections with survival bands

**Files:**

- Modify: `apps/web/src/app/features/board/board.component.ts` (`BoardSection` interface ~line 24; `sections` computed ~318-324; `buildSections` 482-514; `survivalNote` 516-531; `estimateNextUserPick` 477-480; `adpOverall` 445-451)
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json` (or `tsconfig.app.json`, whichever holds `references`)

**Interfaces:**

- Consumes: `survivalBands`, `adpOverall`, `SurvivalBand` from `@draftlab/tiers` (Task 4); `snakePickNumbers` from `@draftlab/strategy-engine`.
- Produces: `BoardSection = { id: SurvivalBandId; label: string; note: string; rows: BoardPlayer[] }` — note `id` replaces the old numeric `tier`, so the template `track` expression must change with it.

`BoardPlayer` (`apps/web/src/app/core/api.types.ts:102-111`) already carries `player`, `evaluation`, `recommendation?`, `drafted`, `target?`, `avoid?`, `projectedPoints?`. It structurally satisfies `TierRow` only via mapping — `survivalBands` is called with a mapped view, see Step 3.

- [ ] **Step 1: Add the dependency**

`apps/web/package.json` dependencies — add `"@draftlab/tiers": "*"`. Add the matching `references` entry to the web tsconfig that lists `../../packages/domain`.

Run: `npm install`
Expected: exit 0.

- [ ] **Step 2: Replace the section interface and delete the percentile logic**

In `board.component.ts`, replace the `BoardSection` interface (line 24-28) with:

```ts
interface BoardSection {
  id: SurvivalBandId;
  label: string;
  note: string;
  rows: BoardPlayer[];
}
```

Delete `buildSections` entirely (lines 482-514) and delete the local `adpOverall` helper (lines 445-451) — it is replaced by the package version, which returns `null` instead of `999`.

**`adpOverall` has a second caller you must fix in the same step.** `compareRows` uses it for the `'adp'` sort case at lines 458-461. The package version returns `number | null`, so the existing subtraction will not type-check. Replace that case with null-last ordering:

```ts
case 'adp': {
  // Package adpOverall returns null for unparseable ADP. Sort those last rather
  // than letting a sentinel rank them as very early or very late.
  const av = adpOverall(a.evaluation.value.adpRoundPick, teamCount);
  const bv = adpOverall(b.evaluation.value.adpRoundPick, teamCount);
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return av - bv;
}
```

This requires `compareRows` to take `teamCount`. Its current signature is `compareRows(a, b, key)` and it **hardcodes `12`** at lines 459-460 — a pre-existing bug that silently mis-sorts every non-12-team league. Change the signature to `compareRows(a: BoardPlayer, b: BoardPlayer, key: SortKey, teamCount: number)` and pass `league?.teamCount ?? 12` from the `filteredSorted` computed at line 315. Fixing this is in scope: the plan is already changing this exact expression, and leaving a known wrong constant in a line being rewritten is not acceptable.

- [ ] **Step 3: Implement the replacement section builder**

Add to `board.component.ts`, importing `survivalBands`, `adpOverall`, and `type SurvivalBandId` from `@draftlab/tiers` and `snakePickNumbers` from `@draftlab/strategy-engine`:

```ts
/** Rounds to plan for when projecting the user's remaining snake picks. */
const PLANNING_ROUNDS = 15;

/**
 * The user's next pick as an overall number, plus how many picks fall before it.
 * Replaces the previous placeholder, which returned the raw draft slot (or 9) and
 * so never advanced as the draft progressed.
 */
function nextUserPick(
  league: League | null,
  picksMade: number,
): { nextOverall: number; picksUntilNext: number } | null {
  const slot = league?.draftSlot;
  if (!slot) return null;
  const teamCount = league?.teamCount ?? 12;
  const picks = snakePickNumbers(slot, teamCount, PLANNING_ROUNDS);
  const nextOverall = picks.find((p) => p > picksMade);
  if (nextOverall === undefined) return null;
  return { nextOverall, picksUntilNext: Math.max(0, nextOverall - picksMade - 1) };
}

function buildSections(
  rows: BoardPlayer[],
  next: { nextOverall: number; picksUntilNext: number },
  teamCount: number,
): BoardSection[] {
  const tierRows = rows.map((row) => ({
    id: row.player.id,
    position: row.player.position,
    draftScore: row.evaluation.draftScore,
    ceilingKnownFactors: row.evaluation.ceiling.knownFactors,
    adpRoundPick: row.evaluation.value.adpRoundPick,
    row,
  }));

  return survivalBands(tierRows, next.nextOverall, next.picksUntilNext, teamCount).map((band) => {
    const bandRows = band.rows.map((r) => r.row);
    return {
      id: band.id,
      label: band.label,
      note: survivalNote(band.id, bandRows, next.nextOverall, teamCount),
      rows: bandRows,
    };
  });
}
```

- [ ] **Step 4: Replace `survivalNote`'s fabricated arithmetic**

The old note claimed `Math.round(n * 0.4)` players would survive — a constant with no basis. Replace `survivalNote` (lines 516-531) with a version that describes the band it is actually in:

```ts
function survivalNote(
  bandId: SurvivalBandId,
  rows: BoardPlayer[],
  nextOverall: number,
  teamCount: number,
): string {
  const left = rows.filter((r) => !r.drafted).length;
  const pickLabel = formatOverallPick(nextOverall, teamCount);
  switch (bandId) {
    case 'gone':
      return `${left} players · unlikely to reach ${pickLabel}`;
    case 'coin-flip':
      return `${left} players · roughly even odds at ${pickLabel}`;
    case 'available':
      return `${left} players · should still be there at ${pickLabel}`;
    case 'adp-unknown':
      return `${left} players · no ADP on file, no survival estimate`;
  }
}
```

Delete `tierLooksTeWindow` if it is now unreferenced — check with a search before removing.

- [ ] **Step 5: Rewire the `sections` computed**

Replace the `sections` computed (lines 318-324) with:

```ts
readonly sections = computed((): BoardSection[] => {
  const rows = this.filteredSorted();
  if (!rows.length) return [];
  const league = this.league();
  // Recomputed on every pick: picksMade is derived from the rows themselves, so
  // the bands re-partition live as the draft progresses.
  const picksMade = this.rows().filter((r) => r.drafted).length;
  const next = nextUserPick(league, picksMade);
  if (!next) return [];
  return buildSections(rows, next, league?.teamCount ?? 12);
});
```

- [ ] **Step 6: Update the template**

In the template (lines 135-140), change the track expression and the tier chrome:

```html
@for (section of sections(); track section.id) {
<div class="tier-break">
  <span class="tier-tag">{{ section.label }}</span>
  <span class="tier-note">{{ section.note }}</span>
  <span class="tier-rule" aria-hidden="true"></span>
</div>
```

- [ ] **Step 7: Verify it builds**

Run: `npm run build -w @draftlab/web`
Expected: exit 0. Type errors naming `section.tier` mean a template or CSS selector still expects the old numeric field.

- [ ] **Step 8: Commit**

```bash
npx prettier --write apps/web
git add apps/web package-lock.json package.json
git commit -m "feat(board): partition by survival bands instead of fixed percentiles"
```

---

## Task 8: Render quality and replacement chips, and cliff markers

**Files:**

- Modify: `apps/web/src/app/features/board/board.component.ts` (template rows ~142-175, plus helpers)
- Modify: `apps/web/src/app/features/board/board.component.css`

**Interfaces:**

- Consumes: `qualityBand` (Task 1), `detectCliffs` (Task 2), `replacementBand` (Task 3) from `@draftlab/tiers`.
- Produces: no exported API — this is presentation only.

- [ ] **Step 1: Add per-row chip helpers**

In the component class:

```ts
/** Absolute quality grade. Independent of filter and of who has been drafted. */
bandOf(row: BoardPlayer): QualityBand | null {
  return qualityBand(row.evaluation.draftScore, row.evaluation.ceiling.knownFactors);
}

/** Which roster slot this player realistically fills in THIS league. */
replacementOf(row: BoardPlayer): string {
  const league = this.league();
  if (!league?.roster) return '';
  return replacementBand(
    this.positionRank(row),
    row.player.position,
    league.roster,
    league.teamCount,
  ).label;
}
```

Positional rank must be computed over the **full** pool, not the filtered view, or the chip would change with the filter — the exact defect being removed. Add a memoised map:

```ts
private readonly positionRanks = computed(() => {
  const ranks = new Map<string, number>();
  const byPosition = new Map<Position, BoardPlayer[]>();
  for (const row of this.rows()) {
    const list = byPosition.get(row.player.position) ?? [];
    list.push(row);
    byPosition.set(row.player.position, list);
  }
  for (const list of byPosition.values()) {
    list
      .slice()
      .sort((a, b) => b.evaluation.draftScore - a.evaluation.draftScore)
      .forEach((row, index) => ranks.set(row.player.id, index + 1));
  }
  return ranks;
});

private positionRank(row: BoardPlayer): number {
  return this.positionRanks().get(row.player.id) ?? Number.MAX_SAFE_INTEGER;
}
```

- [ ] **Step 2: Add cliff markers, bound to the sort axis**

A cliff is a claim about two adjacent rows, so it is only meaningful when the list is ordered by score. Add:

```ts
/** True when the current sort orders rows by a score, making adjacency meaningful. */
private readonly cliffsApply = computed(() => this.sortKey() === 'draft');

/**
 * Row ids after which a cliff falls, per section. Computed on the same axis the
 * list is sorted by (contextualScore ?? draftScore), so the marker always sits
 * between the two rows it describes.
 */
readonly cliffAfterIds = computed((): ReadonlyMap<string, number> => {
  const out = new Map<string, number>();
  if (!this.cliffsApply()) return out;
  for (const section of this.sections()) {
    const measured = section.rows.filter((r) => r.evaluation.ceiling.knownFactors > 0);
    const scores = measured.map((r) => r.recommendation?.contextualScore ?? r.evaluation.draftScore);
    for (const cliff of detectCliffs(scores)) {
      const row = measured[cliff.afterIndex];
      if (row) out.set(row.player.id, cliff.gap);
    }
  }
  return out;
});
```

Note the `knownFactors > 0` filter: a no-data player's mostly-generic score must not manufacture a gap between two measured players.

- [ ] **Step 3: Render the chips and marker in the template**

Inside the row loop, after the position badge, add the two chips:

```html
<span class="c-band">
  @if (bandOf(row); as band) {
  <span class="chip band" [class]="'band-' + band">{{ band }}</span>
  } @else {
  <span class="chip band band-none" title="No measured data">—</span>
  }
  <span class="chip slot">{{ replacementOf(row) }}</span>
</span>
```

After the closing `</div>` of the row, add the cliff marker:

```html
@if (cliffAfterIds().get(row.player.id); as gap) {
<div class="cliff-marker" role="separator">
  <span class="cliff-label">⌄ cliff — {{ gap }} pt gap</span>
</div>
}
```

- [ ] **Step 4: Style the new elements**

Add to `board.component.css`, reusing the existing tier colour tokens from `packages/ui/tokens.css` so the board and the strategy screens stay visually consistent.

**The tokens are `--dl-tier-s`, `--dl-tier-a`, `--dl-tier-b`, `--dl-tier-c`, and `--dl-tier-unrated` — verified in `packages/ui/tokens.css:42-46`. There is no `--dl-tier-d` token.** The D band therefore reuses `--dl-tier-unrated` at full opacity, and the no-data chip uses the same token at reduced opacity, so the two remain distinguishable without inventing a token. Do not add a new token as part of this work — that is a design-system change and belongs in its own branch.

```css
.c-band {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
}

.chip {
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.1875rem 0.375rem;
  border-radius: 0.25rem;
}

.chip.band-S {
  background: var(--dl-tier-s);
  color: #10131a;
}
.chip.band-A {
  background: var(--dl-tier-a);
  color: #10131a;
}
.chip.band-B {
  background: var(--dl-tier-b);
  color: #10131a;
}
.chip.band-C {
  background: var(--dl-tier-c);
  color: #10131a;
}
.chip.band-D {
  background: var(--dl-tier-unrated);
  color: #e6ecf7;
}

/* No measured data: same hue as D, dimmed, so "unknown" reads as weaker than
   "graded low" rather than identical to it. */
.chip.band-none {
  background: var(--dl-tier-unrated);
  color: #c9d1e1;
  opacity: 0.55;
}

.chip.slot {
  background: transparent;
  border: 1px solid currentColor;
  opacity: 0.65;
}

.cliff-marker {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.125rem 0 0.125rem 2.5rem;
}

.cliff-marker::after {
  content: '';
  flex: 1;
  border-top: 1px dashed var(--dl-tier-c);
  opacity: 0.5;
}

.cliff-label {
  font-size: 0.6875rem;
  opacity: 0.75;
  white-space: nowrap;
}
```

Also import the types used by the new helpers into `board.component.ts`: `QualityBand` and `SurvivalBandId` from `@draftlab/tiers`, and `Position` from `@draftlab/domain`.

- [ ] **Step 5: Verify the build**

Run: `npm run build -w @draftlab/web`
Expected: exit 0.

- [ ] **Step 6: Look at the actual board**

Run: `npm run dev:api` in one terminal and `npm run dev:web` in another; open the board for a league.

Read the screen, do not just confirm it renders:

1. Are there three or four survival sections with sensible counts, rather than one section holding everything?
2. Do cliff markers appear, and do they sit at places that look like real dropoffs?
3. Switch the sort to "ADP" — cliff markers must disappear, and sections must stay put.
4. Filter to RB — quality letters and slot chips must **not** change for any player still visible. This is the specific regression this whole plan exists to prevent.
5. Is any position showing no S tier? Expected and correct if its best player is genuinely below the threshold — verify against that player's draftScore rather than assuming a bug.

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/web
git add apps/web
git commit -m "feat(board): add quality and replacement chips with axis-bound cliff markers"
```

---

## Task 9: Full verification and cleanup

**Files:**

- Modify: `docs/06-design-system-and-screens.md:222` (TierBreak description)
- Verify only: everything else

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: PASS across every package. Report any failure verbatim rather than summarising it.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0. If prettier reports files, run `npx prettier --write .` on the offending paths and re-run.

- [ ] **Step 4: Confirm the dead implementation is fully gone**

Run: `grep -rn "buildSections\|CheatSheetGroup\|unranked" --include=*.ts apps packages | grep -v node_modules | grep -v dist`

Expected: hits only in `packages/tiers` (the new implementation) and `apps/web` (the new `buildSections`). Any hit referencing `strategy-engine/tiers` or an `unranked` field is a leftover.

- [ ] **Step 5: Update the design-system doc**

`docs/06-design-system-and-screens.md:222` describes `TierBreak` as marking cliffs. That is now the job of the inline cliff marker, while the rule itself marks survival bands. Update the entry:

```markdown
**`TierBreak`** — the horizontal rule between board survival bands, carrying a
remaining-count and the odds of reaching the user's next pick. Scoring cliffs are
marked separately and inline, by `CliffMarker`, since they answer a different
question and do not align with band boundaries.

**`CliffMarker`** — an inline dashed rule with the point gap, shown between two
adjacent rows where the score drop is large relative to the typical gap. Rendered
only under a score-based sort, where row adjacency is meaningful.
```

- [ ] **Step 6: Commit**

```bash
npx prettier --write docs
git add docs
git commit -m "docs: update TierBreak spec to match survival-band rule and inline cliff markers"
```

- [ ] **Step 7: Push the branch**

```bash
git push -u origin feature/tier-breaks-redesign
```

Do not open a PR without asking first.

---

## Verification Checklist

Against the spec's _Visible behaviour changes_ section — confirm each by looking, not by assuming:

- [ ] Board groups by survival urgency; the top-ranked player is not necessarily the top row.
- [ ] Quality letters do not change when filtering by position.
- [ ] Quality letters do not change as players are drafted.
- [ ] Cheat sheet has no `unranked` section; no-data players appear inline marked `—`.
- [ ] Cliff markers appear only under a score-based sort.
- [ ] A position whose best player is below the S threshold shows no S tier.
- [ ] Players with unparseable ADP land in "ADP unknown", never in "should be there".
- [ ] `k` and `QUALITY_THRESHOLDS` were confirmed against real artifact data, with the numbers recorded in the Task 5 commit message.

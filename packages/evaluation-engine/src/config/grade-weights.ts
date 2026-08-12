import type { FactorGrade, Position } from '@draftlab/domain';

export const GRADE_WEIGHTS: Record<FactorGrade, number> = {
  green: 5,
  yellow: 3,
  orange: -1,
  red: -3,
  unknown: 0,
};

/**
 * Max/min achievable RAW ceiling per position: (currently-sourced known
 * factor count) x (best/worst GRADE_WEIGHTS).
 *
 * Not derived from `benchmark !== 0` on each position's factor list: coverage
 * can differ from available benchmark definitions. These counts are the
 * currently sourced factors real players receive from sleeperMCP.
 *
 * A single global range (assuming every position eventually sources all its
 * factors) structurally capped whichever position had fewest sourced factors
 * below the others regardless of real player quality -- QB's real 1.01-overall
 * players couldn't outscore a mediocre WR because QB only had 5/12 sourced at
 * the time. Update these counts when sleeperMCP's coverage changes (see
 * artifacts/benchmarks.json's "coverage" report after running
 * build_benchmarks.py).
 */
const CEILING_KNOWN_FACTORS: Record<Position, number> = {
  QB: 11,
  RB: 16,
  TE: 12,
  WR: 17,
};

export const CEILING_RANGE: Record<Position, { min: number; max: number }> = Object.fromEntries(
  (Object.entries(CEILING_KNOWN_FACTORS) as Array<[Position, number]>).map(([pos, n]) => [
    pos,
    { min: n * GRADE_WEIGHTS.red, max: n * GRADE_WEIGHTS.green },
  ]),
) as Record<Position, { min: number; max: number }>;

export const DEFAULT_GRADING_BANDS = {
  greenMin: 1.05,
  yellowMin: 0.9,
  orangeMin: 0.75,
} as const;

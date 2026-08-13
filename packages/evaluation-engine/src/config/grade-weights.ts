import type { FactorGrade, GradingBands, Position } from '@draftlab/domain';

export const GRADE_WEIGHTS: Record<FactorGrade, number> = {
  elite: 5,
  green: 3,
  yellow: 1,
  orange: -1,
  red: -3,
  critical: -5,
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
  QB: 12,
  RB: 16,
  TE: 13,
  WR: 17,
};

export const CEILING_RANGE: Record<Position, { min: number; max: number }> = Object.fromEntries(
  (Object.entries(CEILING_KNOWN_FACTORS) as Array<[Position, number]>).map(([pos, n]) => [
    pos,
    { min: n * GRADE_WEIGHTS.critical, max: n * GRADE_WEIGHTS.elite },
  ]),
) as Record<Position, { min: number; max: number }>;

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

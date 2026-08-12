import type {
  CeilingResult,
  FactorInput,
  Position,
  PositionBenchmarkConfig,
} from '@draftlab/domain';
import { getBenchmarkConfig } from './config/benchmarks.js';
import { gradeFactor } from './grade-factor.js';

export interface CeilingOptions {
  season?: number;
  config?: PositionBenchmarkConfig;
}

export function computeCeilingScore(
  position: Position,
  inputs: FactorInput[],
  options: CeilingOptions = {},
): CeilingResult {
  const config = options.config ?? getBenchmarkConfig(position, options.season ?? 2025);

  if (config.provisional) {
    return {
      ceilingScore: null,
      factors: [],
      knownFactors: 0,
      confidenceScore: 0,
      provisional: true,
    };
  }

  const byId = new Map(inputs.map((i) => [i.factorId, i]));
  const factors = config.factors.map((def) =>
    gradeFactor(def, byId.get(def.id), config.bands, { softCapSerious: true }),
  );

  const knownFactors = factors.filter((f) => f.grade !== 'unknown').length;
  // Derived from the position's own factor list, not a hardcoded constant — RB has 16
  // factors (the original 12 plus receptions/yards_per_carry/yards_per_touch/team_wins),
  // not 12, and a fixed denominator would silently miscalculate confidenceScore for it.
  const denom = factors.length;

  // Zero known factors sums to a literal 0 (every weight is 0) — deliberately NOT null.
  // null would trip computeDraftScore's ceiling-weight redistribution, which exists for a
  // different problem (RB's old position-wide provisional gate, where NOBODY at the
  // position had data) and backfires here: redistributing weight onto archetype+risk, which
  // are themselves uniform/neutral defaults for everyone right now, made a zero-data player
  // score even better than before. A real 0 lets this player be judged as "unknown" — via
  // knownFactors/confidenceScore, which callers (cheat sheet tiering) use to exclude
  // low-confidence players from confident ranking — without silently rewarding the gap.
  const ceilingScore = factors.reduce((sum, f) => sum + f.weight, 0);

  let failsTargetShareGate = false;
  if (position === 'TE') {
    const teamTarget = factors.find((f) => f.factorId === 'team_target_rank');
    // Must be 1st or 2nd in team targets — rank > 2 fails the gate.
    if (teamTarget?.value != null && teamTarget.value > 2) {
      failsTargetShareGate = true;
    }
  }

  return {
    ceilingScore,
    factors,
    knownFactors,
    confidenceScore: knownFactors / denom,
    provisional: false,
    failsTargetShareGate,
  };
}

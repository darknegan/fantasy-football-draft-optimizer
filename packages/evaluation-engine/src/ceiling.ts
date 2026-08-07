import type { CeilingResult, FactorInput, Position, PositionBenchmarkConfig } from '@draftlab/domain';
import { FACTORS_PER_POSITION } from './config/grade-weights.js';
import { getBenchmarkConfig } from './config/benchmarks.js';
import { gradeFactor } from './grade-factor.js';

export interface CeilingOptions {
  /** Exclude ADP from the sum (11-factor talent/situation variant). */
  excludeAdp?: boolean;
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
  const factors = config.factors
    .filter((f) => !(options.excludeAdp && f.id === 'adp'))
    .map((def) => gradeFactor(def, byId.get(def.id), config.bands));

  const knownFactors = factors.filter((f) => f.grade !== 'unknown').length;
  const ceilingScore = factors.reduce((sum, f) => sum + f.weight, 0);
  const denom = options.excludeAdp ? FACTORS_PER_POSITION - 1 : FACTORS_PER_POSITION;

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

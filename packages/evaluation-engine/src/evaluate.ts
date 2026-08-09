import type { DraftScoreWeights, FactorInput, Player, PlayerEvaluation } from '@draftlab/domain';
import { evaluateArchetype } from './archetype.js';
import { computeCeilingScore, type CeilingOptions } from './ceiling.js';
import { computeDraftScore, DEFAULT_WEIGHTS } from './draft-score.js';
import { evaluateRisk, type RiskInput } from './risk.js';
import { evaluateValue, type ValueInput } from './value.js';

export interface EvaluatePlayerInput {
  player: Player;
  factors: FactorInput[];
  value: ValueInput;
  risk?: RiskInput;
  weights?: DraftScoreWeights;
  ceilingOptions?: CeilingOptions;
}

export function evaluatePlayer(input: EvaluatePlayerInput): PlayerEvaluation {
  const ceiling = computeCeilingScore(input.player.position, input.factors, input.ceilingOptions);
  const archetype = evaluateArchetype(input.player, input.factors);
  const risk = evaluateRisk(input.player, archetype, input.risk);
  const value = evaluateValue(input.value);
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const draftScore = computeDraftScore(ceiling, archetype, risk, value, weights);

  return {
    playerId: input.player.id,
    ceiling,
    archetype,
    risk,
    value,
    draftScore,
    weights,
  };
}

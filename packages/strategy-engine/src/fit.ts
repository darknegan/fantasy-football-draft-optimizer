import type { Position, StrategyId } from '@draftlab/domain';
import { getRoundTarget } from './strategies.js';
import { isTeDeadZone, winnerRate } from './round-rates.js';

export type FitClass = 'primary' | 'secondary' | 'avoid' | 'neutral';

export const FIT_MULTIPLIERS: Record<FitClass, number> = {
  primary: 1.25,
  secondary: 1.0,
  avoid: 0.6,
  neutral: 1.0,
};

export function classifyFit(strategyId: StrategyId, round: number, position: Position): FitClass {
  const target = getRoundTarget(strategyId, round);
  if (target.primary.includes(position)) return 'primary';
  if (target.secondary.includes(position)) return 'secondary';
  if (target.avoid.includes(position)) return 'avoid';
  return 'neutral';
}

export function strategyFitMultiplier(strategyId: StrategyId, round: number, position: Position): number {
  let fit = classifyFit(strategyId, round, position);
  // Global guardrail: TE round 4 is always treated as avoid, even if a plan forgot it.
  if (position === 'TE' && isTeDeadZone(round)) {
    fit = 'avoid';
  }
  return FIT_MULTIPLIERS[fit];
}

export function strategyFitReason(
  strategyId: StrategyId,
  round: number,
  position: Position,
): { code: string; message: string; severity: 'info' | 'warning' | 'critical' } | null {
  const fit = classifyFit(strategyId, round, position);
  const rate = winnerRate(round, position);
  const pct = `${Math.round(rate * 100)}%`;

  if (position === 'TE' && isTeDeadZone(round)) {
    return {
      code: 'te_round4_dead_zone',
      message: `Round 4 TEs have a ${pct} historical league-winner rate — strong avoid`,
      severity: 'critical',
    };
  }

  if (fit === 'avoid') {
    return {
      code: 'strategy_avoid',
      message: `${position} is an avoid for this strategy in round ${round} (${pct} league-winner rate)`,
      severity: 'warning',
    };
  }

  if (fit === 'primary') {
    return {
      code: 'strategy_primary',
      message: `${position} is a primary target this round (${pct} league-winner rate)`,
      severity: 'info',
    };
  }

  return null;
}

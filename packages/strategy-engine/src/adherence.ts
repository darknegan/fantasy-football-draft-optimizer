import type { PickEvent, Position, StrategyId } from '@draftlab/domain';
import { classifyFit } from './fit.js';

export type AdherenceState = 'on_plan' | 'drifting' | 'pivot_recommended';

export interface AdherenceResult {
  score: number; // 0–100
  state: AdherenceState;
  offPlanCount: number;
  gapPositions: Position[];
  suggestedPivot?: StrategyId;
}

export interface AdherencePick {
  round: number;
  position: Position;
}

/**
 * Score how closely actual picks match the declared plan.
 * primary = 1.0, secondary = 0.7, neutral = 0.4, avoid = 0.
 */
export function scoreAdherence(strategyId: StrategyId, picks: AdherencePick[]): AdherenceResult {
  if (picks.length === 0) {
    return { score: 100, state: 'on_plan', offPlanCount: 0, gapPositions: [] };
  }

  let total = 0;
  let offPlanCount = 0;
  const gapPositions: Position[] = [];

  for (const pick of picks) {
    const fit = classifyFit(strategyId, pick.round, pick.position);
    const weight = fit === 'primary' ? 1 : fit === 'secondary' ? 0.7 : fit === 'neutral' ? 0.4 : 0;
    total += weight;
    if (fit === 'avoid' || fit === 'neutral') {
      offPlanCount += 1;
      gapPositions.push(pick.position);
    }
  }

  const score = Math.round((total / picks.length) * 100);
  let state: AdherenceState = 'on_plan';
  if (offPlanCount >= 3 && score < 50) state = 'pivot_recommended';
  else if (offPlanCount >= 2) state = 'drifting';

  return { score, state, offPlanCount, gapPositions };
}

export function picksFromEvents(
  events: PickEvent[],
  userRosterId: string,
  playerPosition: (playerId: string) => Position | null,
): AdherencePick[] {
  return events
    .filter((e) => e.rosterId === userRosterId && e.playerId)
    .map((e) => {
      const position = playerPosition(e.playerId!);
      return position ? { round: e.round, position } : null;
    })
    .filter((p): p is AdherencePick => p != null);
}

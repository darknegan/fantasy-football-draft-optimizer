import type { Player, Position } from '@draftlab/domain';

export interface ScarcityInput {
  available: Player[];
  position: Position;
  /** Picks until the user's next selection. */
  picksUntilNext: number;
  /** How many top-tier players at this position remain (by draftScore rank). */
  topTierCount?: number;
}

/**
 * Urgency rises when few quality options remain at a position before the user's next pick.
 * Returns multiplier in ~[0.9, 1.3].
 */
export function scarcityUrgencyMultiplier(input: ScarcityInput): number {
  const atPos = input.available.filter((p) => p.position === input.position);
  const tierSize = input.topTierCount ?? Math.min(6, Math.ceil(atPos.length * 0.15));
  const remaining = Math.max(atPos.length, 0);

  if (remaining === 0) return 0.9;

  // Expected drain before next pick — assume competitors take ~35% skill-position mix.
  const expectedDrain = Math.max(0, Math.floor(input.picksUntilNext * 0.35));
  const projectedLeft = remaining - expectedDrain;

  if (projectedLeft <= 1 && tierSize <= 3) return 1.3;
  if (projectedLeft <= tierSize / 2) return 1.15;
  if (input.picksUntilNext <= 2 && remaining <= tierSize) return 1.2;
  return 1.0;
}

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

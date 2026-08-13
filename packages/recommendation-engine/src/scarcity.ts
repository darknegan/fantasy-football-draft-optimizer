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

import type { MaxBidResult } from '@draftlab/domain';

/**
 * Max bid = remainingBudget − (slotsLeft − 1) × $1 stub.
 * Optionally reserve a buffer for known targets still available.
 */
export function computeMaxBid(opts: {
  playerId: string;
  remainingBudget: number;
  slotsLeft: number;
  /** Extra dollars to keep for other must-have targets. */
  targetReserve?: number;
}): MaxBidResult {
  const slotsLeft = Math.max(1, opts.slotsLeft);
  const reserveForRest = Math.max(0, slotsLeft - 1) + Math.max(0, opts.targetReserve ?? 0);
  const maxBid = Math.max(1, opts.remainingBudget - reserveForRest);
  return {
    playerId: opts.playerId,
    maxBid,
    remainingBudget: opts.remainingBudget,
    slotsLeft,
    reserveForRest,
  };
}

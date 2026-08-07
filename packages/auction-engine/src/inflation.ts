import type { AuctionBid, AuctionPlayerValue } from '@draftlab/domain';

/**
 * Inflation = (sum paid − sum fair for purchased) / remaining fair pool.
 * Positive means the room is overspending and remaining players should inflate.
 */
export function computeInflationRate(
  bids: AuctionBid[],
  values: AuctionPlayerValue[],
): number {
  if (!bids.length) return 0;
  const byId = new Map(values.map((v) => [v.playerId, v]));
  let paid = 0;
  let fairPurchased = 0;
  const purchased = new Set<string>();

  for (const bid of bids) {
    paid += bid.amount;
    purchased.add(bid.playerId);
    fairPurchased += byId.get(bid.playerId)?.fairValue ?? bid.amount;
  }

  const remainingFair = values
    .filter((v) => !purchased.has(v.playerId))
    .reduce((s, v) => s + v.fairValue, 0);

  if (remainingFair <= 0) return 0;
  const rate = (paid - fairPurchased) / remainingFair;
  // Clamp extreme early-sample swings.
  return Math.round(Math.max(-0.35, Math.min(0.8, rate)) * 1000) / 1000;
}

export function applyInflation(
  values: AuctionPlayerValue[],
  inflationRate: number,
  purchasedIds: Set<string>,
): AuctionPlayerValue[] {
  return values.map((v) => {
    if (purchasedIds.has(v.playerId)) {
      return { ...v, inflatedValue: v.fairValue };
    }
    return {
      ...v,
      inflatedValue: Math.max(1, Math.round(v.fairValue * (1 + inflationRate))),
    };
  });
}

import type { AuctionBid, AuctionTeamBudget } from '@draftlab/domain';

export function initTeamBudgets(
  teams: Array<{ rosterId: string; name: string }>,
  budgetPerTeam: number,
  rosterSlotsTotal: number,
): AuctionTeamBudget[] {
  return teams.map((t) => ({
    rosterId: t.rosterId,
    name: t.name,
    startingBudget: budgetPerTeam,
    spent: 0,
    remaining: budgetPerTeam,
    rosterSlotsFilled: 0,
    rosterSlotsTotal,
  }));
}

export function applyBidToBudgets(
  budgets: AuctionTeamBudget[],
  bid: AuctionBid,
): AuctionTeamBudget[] {
  return budgets.map((b) => {
    if (b.rosterId !== bid.rosterId) return b;
    const spent = b.spent + bid.amount;
    return {
      ...b,
      spent,
      remaining: Math.max(0, b.startingBudget - spent),
      rosterSlotsFilled: b.rosterSlotsFilled + 1,
    };
  });
}

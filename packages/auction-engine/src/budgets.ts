import type { AuctionBid, AuctionTeamBudget } from '@draftlab/domain';

export function remainingBudget(team: AuctionTeamBudget): number {
  return Math.max(0, team.startingBudget - team.spent - (team.deadCap ?? 0));
}

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
    deadCap: 0,
  }));
}

export function applyBidToBudgets(
  budgets: AuctionTeamBudget[],
  bid: AuctionBid,
): AuctionTeamBudget[] {
  return budgets.map((b) => {
    if (b.rosterId !== bid.rosterId) return b;
    if (bid.isPenalty) {
      const next: AuctionTeamBudget = {
        ...b,
        deadCap: (b.deadCap ?? 0) + bid.amount,
      };
      return { ...next, remaining: remainingBudget(next) };
    }
    const next: AuctionTeamBudget = {
      ...b,
      spent: b.spent + bid.amount,
      rosterSlotsFilled: b.rosterSlotsFilled + 1,
    };
    return { ...next, remaining: remainingBudget(next) };
  });
}

export function removeBidFromBudgets(
  budgets: AuctionTeamBudget[],
  bid: AuctionBid,
): AuctionTeamBudget[] {
  return budgets.map((b) => {
    if (b.rosterId !== bid.rosterId) return b;
    if (bid.isPenalty) {
      const next: AuctionTeamBudget = {
        ...b,
        deadCap: Math.max(0, (b.deadCap ?? 0) - bid.amount),
      };
      return { ...next, remaining: remainingBudget(next) };
    }
    const next: AuctionTeamBudget = {
      ...b,
      spent: Math.max(0, b.spent - bid.amount),
      rosterSlotsFilled: Math.max(0, b.rosterSlotsFilled - 1),
    };
    return { ...next, remaining: remainingBudget(next) };
  });
}

export function addDeadCap(
  budgets: AuctionTeamBudget[],
  rosterId: string,
  amount: number,
): AuctionTeamBudget[] {
  if (amount <= 0) return budgets;
  return budgets.map((b) => {
    if (b.rosterId !== rosterId) return b;
    const next: AuctionTeamBudget = { ...b, deadCap: (b.deadCap ?? 0) + amount };
    return { ...next, remaining: remainingBudget(next) };
  });
}

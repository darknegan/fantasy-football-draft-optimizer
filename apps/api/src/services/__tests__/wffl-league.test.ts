import { describe, expect, it } from 'vitest';
import { DEPTH_SEED_PLAYERS } from '../../data/seed-depth.js';
import { SEED_PLAYERS } from '../../data/seed-players.js';
import {
  buildWfflAuction,
  matchPlayerId,
  WFFL_BUDGET,
  WFFL_EXTERNAL_ID,
  WFFL_ROSTER,
  WFFL_TEAMS,
} from '../../data/wffl-league.js';
import { AppStore } from '../store.js';

const catalog = [...SEED_PLAYERS, ...DEPTH_SEED_PLAYERS];

describe('WFFL global keeper auction', () => {
  it('matches abbreviated sheet names to catalog players', () => {
    const players = catalog.map((s) => s.player);
    expect(matchPlayerId('Puka Nacua', players)).toBe('puka-nacua');
    expect(matchPlayerId('A. St. Brown', players)).toBe('amon-ra-st-brown');
    expect(matchPlayerId('B. Bowers', players)).toBe('brock-bowers');
  });

  it('builds 12 named teams with keepers and remaining budget after salaries + dead cap', () => {
    const auction = buildWfflAuction({
      players: catalog.map((s) => s.player),
      rosterSlots: 16,
    });
    expect(auction.teams).toHaveLength(12);
    expect(auction.teams.map((t) => t.code)).toEqual(WFFL_TEAMS.map((t) => t.code));
    const man = auction.teams.find((t) => t.code === 'MAN')!;
    expect(man.name).toBe('Manhattan Empire');
    expect(man.spent).toBe(31);
    expect(man.deadCap).toBe(0);
    expect(man.remaining).toBe(WFFL_BUDGET - 31);

    const jph = auction.teams.find((t) => t.code === 'JPH')!;
    expect(jph.spent).toBe(16);
    expect(jph.deadCap).toBe(5);
    expect(jph.remaining).toBe(WFFL_BUDGET - 21);

    const keepers = auction.bids.filter((b) => !b.isPenalty);
    const penalties = auction.bids.filter((b) => b.isPenalty);
    expect(keepers.length).toBeGreaterThanOrEqual(28);
    expect(penalties.length).toBe(10);
  });

  it('seeds the league for a user with keepers already signed', () => {
    const store = new AppStore(catalog);
    const league = store.seedWfflLeague('user-1');
    expect(league.externalId).toBe(WFFL_EXTERNAL_ID);
    expect(league.name).toBe('WFFL Auction Keepers');
    expect(league.draftType).toBe('auction');
    expect(league.auctionBudget).toBe(200);

    const state = store.auctionState(league.id)!;
    expect(state.budgets).toHaveLength(12);
    expect(state.budgets[0]!.name).toBe('Manhattan Empire');
    expect(state.userBudget.name).toBe('Plano Red Pandas');
    expect(state.userBudget.code).toBe('PRP');
    expect(state.userBudget.spent).toBe(26);
    expect(state.userBudget.deadCap).toBe(3);
    expect(state.userBudget.remaining).toBe(171);
    expect(state.signedRoster?.some((p) => p.name === 'Bucky Irving')).toBe(true);
    expect(state.signedRoster?.some((p) => p.name === 'Quinshon Judkins')).toBe(true);
    expect(state.signedRoster?.some((p) => p.name === 'Michael Pittman')).toBe(true);
    expect(state.signedRoster?.some((p) => p.name === 'Puka Nacua')).toBe(false);
    expect(state.values.some((v) => v.name === 'Bucky Irving')).toBe(false);
    expect(state.history?.records).toHaveLength(12);
    expect(state.history?.draft2025.length).toBe(166);

    const again = store.seedWfflLeague('user-1');
    expect(again.id).toBe(league.id);
  });

  it('drops a keeper and charges the year-based penalty', () => {
    const store = new AppStore(catalog);
    const league = store.seedWfflLeague('user-1');
    const before = store.auctionState(league.id)!;
    const bucky = before.signedRoster?.find((p) => p.name === 'Bucky Irving');
    expect(bucky).toBeTruthy();
    expect(bucky!.dropPenalty).toBe(2);

    const after = store.releaseAuctionContract(league.id, bucky!.playerId);
    expect(after && 'error' in after).toBe(false);
    const state = after as NonNullable<typeof before>;
    expect(state.signedRoster?.some((p) => p.name === 'Bucky Irving')).toBe(false);
    expect(state.userBudget.deadCap).toBe(5);
    expect(state.userBudget.remaining).toBe(171 + 8 - 2);
  });

  it('lets a user claim another franchise without moving keepers', () => {
    const store = new AppStore(catalog);
    const league = store.seedWfflLeague('user-1');
    const before = store.auctionState(league.id)!;
    const man = before.budgets.find((b) => b.code === 'MAN');
    expect(man).toBeTruthy();

    const after = store.claimAuctionTeam(league.id, man!.rosterId);
    expect(after && 'error' in after).toBe(false);
    const state = after as NonNullable<typeof before>;
    expect(state.userBudget.code).toBe('MAN');
    expect(state.userBudget.name).toBe('Manhattan Empire');
    expect(state.userBudget.remaining).toBe(169);
    expect(state.signedRoster?.some((p) => p.name === 'Puka Nacua')).toBe(true);
    expect(state.signedRoster?.some((p) => p.name === 'Bucky Irving')).toBe(false);
    const pandas = state.budgets.find((b) => b.code === 'PRP');
    expect(pandas?.rosterId).not.toBe(state.userBudget.rosterId);
    expect(state.teamRosters?.find((t) => t.code === 'PRP')?.players.some((p) => p.name === 'Bucky Irving')).toBe(
      true,
    );
  });

  it('upgrades existing WFFL clones to the K/DEF roster', () => {
    const store = new AppStore(catalog);
    const league = store.seedWfflLeague('user-1');
    store.updateLeague(league.id, {
      roster: { qb: 1, rb: 2, wr: 2, te: 1, flex: 2, superflex: 0, bench: 8, totalStarters: 8 },
    });
    store.applyWfflTemplateIfEmpty(league.id);
    expect(store.getLeague(league.id)?.roster).toEqual(WFFL_ROSTER);
    const state = store.auctionState(league.id)!;
    expect(state.values.some((v) => v.position === 'K')).toBe(true);
    expect(state.userBudget.rosterSlotsTotal).toBe(15);
  });

  it('lists kickers and defenses on the WFFL board at last-year cost', () => {
    const store = new AppStore(catalog);
    const league = store.seedWfflLeague('user-1');
    const state = store.auctionState(league.id)!;
    expect(state.values.some((v) => v.position === 'K')).toBe(true);
    expect(state.values.some((v) => v.position === 'DEF')).toBe(true);
    expect(state.values.find((v) => v.name === 'Brandon Aubrey')?.fairValue).toBe(4);
    expect(state.values.find((v) => v.name === 'Cam Little')?.fairValue).toBe(7);
    expect(state.values.find((v) => v.name === 'Broncos')?.fairValue).toBe(6);
    expect(state.values.find((v) => v.name === 'Younghoe Koo')?.lastYearCost).toBe(1);
    const board = store.getBoard(league.id);
    expect(board.some((row) => row.player.position === 'K')).toBe(true);
    expect(board.some((row) => row.player.position === 'DEF')).toBe(true);
  });
});

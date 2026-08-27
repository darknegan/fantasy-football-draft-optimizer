import { describe, expect, it } from 'vitest';
import { DEPTH_SEED_PLAYERS } from '../../data/seed-depth.js';
import { SEED_PLAYERS } from '../../data/seed-players.js';
import {
  buildWfflAuction,
  matchPlayerId,
  WFFL_BUDGET,
  WFFL_EXTERNAL_ID,
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
    expect(state.userBudget.remaining).toBe(169);
    expect(state.signedRoster?.some((p) => p.name === 'Puka Nacua')).toBe(true);
    expect(state.values.some((v) => v.name === 'Puka Nacua')).toBe(false);
    expect(state.history?.records).toHaveLength(12);
    expect(state.history?.draft2025.length).toBe(166);

    const again = store.seedWfflLeague('user-1');
    expect(again.id).toBe(league.id);
  });

  it('drops a keeper and charges the year-based penalty', () => {
    const store = new AppStore(catalog);
    const league = store.seedWfflLeague('user-1');
    const before = store.auctionState(league.id)!;
    const puka = before.signedRoster?.find((p) => p.name === 'Puka Nacua');
    expect(puka).toBeTruthy();
    expect(puka!.dropPenalty).toBe(3);

    const after = store.releaseAuctionContract(league.id, puka!.playerId);
    expect(after && 'error' in after).toBe(false);
    const state = after as NonNullable<typeof before>;
    expect(state.signedRoster?.some((p) => p.name === 'Puka Nacua')).toBe(false);
    expect(state.userBudget.deadCap).toBe(3);
    expect(state.userBudget.remaining).toBe(169 + 15 - 3);
    expect(state.values.some((v) => v.playerId === puka!.playerId)).toBe(true);
  });
});

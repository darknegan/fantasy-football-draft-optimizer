import { describe, expect, it } from 'vitest';
import type { AuctionValuesArtifact } from '@draftlab/auction-engine';
import { AppStore } from '../store.js';
import { SEED_PLAYERS } from '../../data/seed-players.js';

const board: AuctionValuesArtifact = {
  schema_version: 1,
  generated_at: '2026-08-17T00:00:00Z',
  id: '1qb-full-ppr',
  label: '1QB Full PPR',
  budget: 200,
  num_teams: 12,
  roster_spots: 15,
  format: { ppr: 1, numQbs: 1, numTeams: 12, isDynasty: false },
  players: [
    {
      name: 'Josh Allen',
      position: 'QB',
      team: 'BUF',
      sleeper_id: '4984',
      market_value: 5000,
      fair: 42,
      max: 47,
      overall_rank: 8,
      position_rank: 1,
    },
  ],
};

describe('auction room values from sleeperMCP boards', () => {
  it('uses the 1QB PPR board fair price instead of VORP dollars', () => {
    const allen = SEED_PLAYERS.find((s) => s.player.id === 'josh-allen');
    expect(allen).toBeTruthy();
    const store = new AppStore([allen!], { auctionBoards: [board] });
    const { auction } = store.seedDemoLeagues('demo-user');
    const state = store.auctionState(auction.id);
    expect(state?.valueBoard).toEqual({ id: '1qb-full-ppr', label: '1QB Full PPR' });
    const row = state?.values.find((v) => v.playerId === 'josh-allen');
    expect(row?.fairValue).toBe(42);
    expect(row?.inflatedValue).toBe(42);
    expect(row?.overallRank).toBe(8);
  });
});

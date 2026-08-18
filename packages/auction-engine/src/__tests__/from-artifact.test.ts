import { describe, expect, it } from 'vitest';
import type { RosterShape, ScoringProfile } from '@draftlab/domain';
import {
  dollarValuesFromAuctionBoard,
  rescaleAuctionFair,
  selectAuctionBoard,
  selectAuctionBoardId,
  type AuctionValuesArtifact,
} from '../from-artifact.js';

const roster1qb: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  bench: 6,
  totalStarters: 7,
};

const rosterSf: RosterShape = { ...roster1qb, superflex: 1, totalStarters: 8 };

const ppr: ScoringProfile = {
  id: 'ppr',
  name: 'PPR',
  variant: 'ppr',
  passYd: 0.04,
  passTd: 4,
  interception: -2,
  rushYd: 0.1,
  rushTd: 6,
  reception: 1,
  recYd: 0.1,
  recTd: 6,
  fumbleLost: -2,
};

const half: ScoringProfile = { ...ppr, id: 'half', name: 'Half', variant: 'half_ppr', reception: 0.5 };
const std: ScoringProfile = { ...ppr, id: 'std', name: 'Std', variant: 'standard', reception: 0 };

function board(id: string, players: AuctionValuesArtifact['players']): AuctionValuesArtifact {
  return {
    schema_version: 1,
    generated_at: '2026-08-17T00:00:00Z',
    id,
    label: id,
    budget: 200,
    num_teams: 12,
    roster_spots: 15,
    format: { ppr: 1, numQbs: 1, numTeams: 12, isDynasty: false },
    players,
  };
}

describe('selectAuctionBoardId', () => {
  it('uses the superflex board for SF / 2QB regardless of PPR', () => {
    expect(selectAuctionBoardId({ variant: 'ppr', superflex: true })).toBe('superflex-full-ppr');
    expect(selectAuctionBoardId({ variant: 'half_ppr', superflex: true })).toBe('superflex-full-ppr');
  });

  it('maps 1QB full PPR to the PPR board', () => {
    expect(selectAuctionBoardId({ variant: 'ppr', superflex: false })).toBe('1qb-full-ppr');
  });

  it('maps 1QB half-PPR and standard onto the half-PPR board', () => {
    expect(selectAuctionBoardId({ variant: 'half_ppr', superflex: false })).toBe('1qb-half-ppr');
    expect(selectAuctionBoardId({ variant: 'standard', superflex: false })).toBe('1qb-half-ppr');
  });
});

describe('selectAuctionBoard', () => {
  const boards = [
    board('1qb-full-ppr', []),
    board('1qb-half-ppr', []),
    board('superflex-full-ppr', []),
  ];

  it('picks the matching snapshot from a loaded set', () => {
    expect(selectAuctionBoard(boards, { scoring: ppr, roster: roster1qb })?.id).toBe('1qb-full-ppr');
    expect(selectAuctionBoard(boards, { scoring: half, roster: roster1qb })?.id).toBe('1qb-half-ppr');
    expect(selectAuctionBoard(boards, { scoring: ppr, roster: rosterSf })?.id).toBe('superflex-full-ppr');
    expect(selectAuctionBoard(boards, { scoring: std, roster: roster1qb })?.id).toBe('1qb-half-ppr');
  });

  it('returns null when the selected board was not loaded', () => {
    expect(selectAuctionBoard([board('1qb-half-ppr', [])], { scoring: ppr, roster: roster1qb })).toBeNull();
  });
});

describe('rescaleAuctionFair', () => {
  const snap = { budget: 200, teams: 12, slots: 15 };

  it('leaves prices unchanged when the pool matches the snapshot', () => {
    expect(rescaleAuctionFair(61, snap, snap)).toBe(61);
  });

  it('scales the dollars above the $1 floor when the cap changes', () => {
    // Snapshot discretionary = 12*(200-15)=2220; $300 cap → 12*(300-15)=3420.
    const bigger = { budget: 300, teams: 12, slots: 15 };
    expect(rescaleAuctionFair(61, snap, bigger)).toBe(93);
  });
});

describe('dollarValuesFromAuctionBoard', () => {
  const artifact = board('1qb-full-ppr', [
    {
      name: 'Jahmyr Gibbs',
      position: 'RB',
      team: 'DET',
      sleeper_id: '9221',
      market_value: 10000,
      fair: 61,
      max: 68,
    },
    {
      name: 'Josh Allen',
      position: 'QB',
      team: 'BUF',
      sleeper_id: '4984',
      market_value: 4000,
      fair: 25,
      max: 28,
    },
    {
      name: 'Unknown FA',
      position: 'WR',
      team: null,
      sleeper_id: '999999',
      market_value: 100,
      fair: 3,
      max: 3,
    },
  ]);

  it('maps sleeper ids onto DraftLab player ids and skips unmatched rows', () => {
    const values = dollarValuesFromAuctionBoard(artifact, {
      sleeperIdToPlayerId: new Map([
        ['9221', 'jahmyr-gibbs'],
        ['4984', 'josh-allen'],
      ]),
      teamCount: 12,
      budgetPerTeam: 200,
      rosterSlots: 15,
    });
    expect(values.map((v) => v.playerId)).toEqual(['jahmyr-gibbs', 'josh-allen']);
    expect(values[0]!.fairValue).toBe(61);
    expect(values[0]!.inflatedValue).toBe(61);
    expect(values[0]!.ceilingValue).toBe(68);
    expect(values[0]!.vorpShare).toBe(0.7143);
    expect(values[1]!.fairValue).toBe(25);
    expect(values[1]!.ceilingValue).toBe(28);
    expect(values[1]!.vorpShare).toBe(0.2857);
  });
});

import { describe, expect, it } from 'vitest';
import { suggestNextTargets } from '../next-targets.js';
import type { AuctionNextTargetInput } from '../next-targets.js';

const roster = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0 };

const board: AuctionNextTargetInput['available'] = [
  { playerId: 'cmc', name: 'Christian McCaffrey', position: 'RB', fairValue: 58, inflatedValue: 58, draftScore: 99 },
  { playerId: 'chase', name: "Ja'Marr Chase", position: 'WR', fairValue: 54, inflatedValue: 54, draftScore: 97 },
  { playerId: 'jefferson', name: 'Justin Jefferson', position: 'WR', fairValue: 50, inflatedValue: 50, draftScore: 95 },
  { playerId: 'hall', name: 'Breece Hall', position: 'RB', fairValue: 42, inflatedValue: 42, draftScore: 88 },
  { playerId: 'puka', name: 'Puka Nacua', position: 'WR', fairValue: 40, inflatedValue: 40, draftScore: 86 },
  { playerId: 'allen', name: 'Josh Allen', position: 'QB', fairValue: 28, inflatedValue: 28, draftScore: 84 },
  { playerId: 'kelce', name: 'Travis Kelce', position: 'TE', fairValue: 22, inflatedValue: 22, draftScore: 70 },
  { playerId: 'mid-rb', name: 'James Conner', position: 'RB', fairValue: 16, inflatedValue: 16, draftScore: 62 },
  { playerId: 'mid-wr', name: 'Chris Olave', position: 'WR', fairValue: 15, inflatedValue: 15, draftScore: 60 },
  { playerId: 'mid-qb', name: 'Baker Mayfield', position: 'QB', fairValue: 12, inflatedValue: 12, draftScore: 55 },
  { playerId: 'mid-te', name: 'Jake Ferguson', position: 'TE', fairValue: 10, inflatedValue: 10, draftScore: 48 },
  { playerId: 'cheap-wr', name: 'Rashid Shaheed', position: 'WR', fairValue: 5, inflatedValue: 5, draftScore: 30 },
  { playerId: 'rb-a', name: 'Depth RB A', position: 'RB', fairValue: 8, inflatedValue: 8, draftScore: 28 },
  { playerId: 'rb-b', name: 'Depth RB B', position: 'RB', fairValue: 6, inflatedValue: 6, draftScore: 24 },
  { playerId: 'rb-c', name: 'Depth RB C', position: 'RB', fairValue: 4, inflatedValue: 4, draftScore: 18 },
  { playerId: 'wr-a', name: 'Depth WR A', position: 'WR', fairValue: 7, inflatedValue: 7, draftScore: 26 },
  { playerId: 'wr-b', name: 'Depth WR B', position: 'WR', fairValue: 4, inflatedValue: 4, draftScore: 16 },
  { playerId: 'wr-c', name: 'Depth WR C', position: 'WR', fairValue: 3, inflatedValue: 3, draftScore: 12 },
  { playerId: 'qb-a', name: 'Depth QB A', position: 'QB', fairValue: 4, inflatedValue: 4, draftScore: 14 },
  { playerId: 'te-a', name: 'Depth TE A', position: 'TE', fairValue: 4, inflatedValue: 4, draftScore: 14 },
  { playerId: 'te-b', name: 'Depth TE B', position: 'TE', fairValue: 2, inflatedValue: 2, draftScore: 8 },
];

function base(overrides: Partial<AuctionNextTargetInput> = {}): AuctionNextTargetInput {
  return {
    strategyId: 'hero_rb',
    signed: [],
    remainingBudget: 200,
    slotsLeft: 13,
    roster,
    available: board,
    limit: 3,
    ...overrides,
  };
}

describe('suggestNextTargets', () => {
  it('opens an empty Hero RB board with a star RB, not three elites', () => {
    const picks = suggestNextTargets(base());
    expect(picks[0]?.position).toBe('RB');
    expect(picks[0]!.inflatedValue).toBeGreaterThanOrEqual(40);
    expect(picks.filter((p) => p.inflatedValue >= 40)).toHaveLength(2);
    expect(picks[2]!.inflatedValue).toBeLessThan(30);
  });

  it('stops recommending stars after two expensive signings', () => {
    const picks = suggestNextTargets(
      base({
        remainingBudget: 110,
        slotsLeft: 11,
        signed: [
          { position: 'RB', amount: 48 },
          { position: 'WR', amount: 42 },
        ],
      }),
    );
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((p) => p.inflatedValue < 30)).toBe(true);
    expect(picks.map((p) => p.playerId)).not.toContain('jefferson');
    expect(picks.map((p) => p.playerId)).not.toContain('chase');
  });

  it('recommends cheap fillers when the auction is late and budget is thin', () => {
    const picks = suggestNextTargets(
      base({
        remainingBudget: 22,
        slotsLeft: 6,
        signed: [
          { position: 'RB', amount: 48 },
          { position: 'WR', amount: 42 },
          { position: 'WR', amount: 18 },
          { position: 'RB', amount: 16 },
          { position: 'QB', amount: 12 },
          { position: 'TE', amount: 10 },
          { position: 'WR', amount: 8 },
        ],
      }),
    );
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((p) => p.inflatedValue <= 12)).toBe(true);
  });
});

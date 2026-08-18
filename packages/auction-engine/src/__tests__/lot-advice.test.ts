import { describe, expect, it } from 'vitest';
import type { Position } from '@draftlab/domain';
import { recommendAuctionLot } from '../lot-advice.js';
import type { AuctionLotAdviceInput } from '../lot-advice.js';

const roster = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0 };

const cheapBoard: Array<{ position: Position; fairValue: number }> = [
  { position: 'QB', fairValue: 8 },
  { position: 'RB', fairValue: 12 },
  { position: 'RB', fairValue: 10 },
  { position: 'WR', fairValue: 11 },
  { position: 'WR', fairValue: 9 },
  { position: 'TE', fairValue: 6 },
];

function base(overrides: Partial<AuctionLotAdviceInput> = {}): AuctionLotAdviceInput {
  return {
    strategyId: 'hero_rb',
    position: 'RB',
    playerName: 'Breece Hall',
    fairValue: 42,
    inflatedValue: 42,
    ceilingValue: 50,
    signed: [],
    remainingBudget: 200,
    slotsLeft: 13,
    roster,
    available: cheapBoard,
    ...overrides,
  };
}

describe('recommendAuctionLot', () => {
  it('tells Hero RB to take an RB1 at fair with an empty roster', () => {
    const advice = recommendAuctionLot(base());
    expect(advice.verdict).toBe('take');
    expect(advice.headline).toMatch(/take/i);
    expect(advice.reason).toMatch(/Hero RB/i);
    expect(advice.reason).toMatch(/RB/i);
    expect(advice.reason).toMatch(/\$42/);
  });

  it('tells Balanced to pass on an early QB', () => {
    const advice = recommendAuctionLot(
      base({
        strategyId: 'balanced',
        position: 'QB',
        playerName: 'Josh Allen',
        fairValue: 28,
        inflatedValue: 28,
        ceilingValue: 35,
      }),
    );
    expect(advice.verdict).toBe('pass');
    expect(advice.headline).toMatch(/let him go|pass/i);
    expect(advice.reason).toMatch(/Balanced/i);
    expect(advice.reason).toMatch(/QB/i);
  });

  it('passes when the price would leave less than $1 per remaining spot', () => {
    const advice = recommendAuctionLot(
      base({
        fairValue: 40,
        inflatedValue: 195,
        ceilingValue: 60,
        playerName: 'Star RB',
      }),
    );
    expect(advice.verdict).toBe('pass');
    expect(advice.reason).toMatch(/budget|spot|\$200|left/i);
  });

  it('passes when you only have $10 left and the player still costs $49', () => {
    const advice = recommendAuctionLot(
      base({
        position: 'WR',
        playerName: 'Puka Nacua',
        fairValue: 50,
        inflatedValue: 49,
        ceilingValue: 56,
        remainingBudget: 10,
        slotsLeft: 8,
        signed: [
          { position: 'RB' },
          { position: 'RB' },
          { position: 'WR' },
          { position: 'TE' },
          { position: 'QB' },
        ],
      }),
    );
    expect(advice.verdict).toBe('pass');
    expect(advice.reason).toMatch(/\$10/);
  });

  it('passes a $35 WR when you still need RB and only have $40 left', () => {
    const advice = recommendAuctionLot(
      base({
        strategyId: 'balanced',
        position: 'WR',
        playerName: 'Expensive WR',
        fairValue: 35,
        inflatedValue: 35,
        ceilingValue: 40,
        signed: [{ position: 'WR' }],
        remainingBudget: 40,
        slotsLeft: 12,
        available: [
          { position: 'RB', fairValue: 12 },
          { position: 'RB', fairValue: 14 },
          { position: 'WR', fairValue: 9 },
          { position: 'QB', fairValue: 6 },
          { position: 'TE', fairValue: 5 },
        ],
      }),
    );
    expect(advice.verdict).toBe('pass');
    expect(advice.reason).toMatch(/RB/i);
  });

  it('passes on a third RB once Hero RB already has its anchor pair and the price is rich', () => {
    const advice = recommendAuctionLot(
      base({
        position: 'RB',
        playerName: 'Handcuff RB',
        fairValue: 12,
        inflatedValue: 22,
        ceilingValue: 18,
        signed: [{ position: 'RB' }, { position: 'WR' }],
        remainingBudget: 140,
        slotsLeft: 11,
      }),
    );
    expect(advice.verdict).toBe('pass');
    expect(advice.reason).toMatch(/already|fade|WR|need/i);
  });

  it('passes an expensive extra WR once RB and WR starters are filled', () => {
    const advice = recommendAuctionLot(
      base({
        strategyId: 'balanced',
        position: 'WR',
        playerName: 'Luxury WR',
        fairValue: 45,
        inflatedValue: 45,
        ceilingValue: 50,
        signed: [
          { position: 'RB' },
          { position: 'RB' },
          { position: 'WR' },
          { position: 'WR' },
        ],
        remainingBudget: 60,
        slotsLeft: 9,
        available: [
          { position: 'QB', fairValue: 8 },
          { position: 'TE', fairValue: 7 },
          { position: 'WR', fairValue: 6 },
          { position: 'RB', fairValue: 5 },
        ],
      }),
    );
    expect(advice.verdict).toBe('pass');
  });

  it('uses contemplated price so an $8 bid can be a take when inflated is $49', () => {
    const advice = recommendAuctionLot(
      base({
        strategyId: 'balanced',
        position: 'WR',
        playerName: 'Puka Nacua',
        fairValue: 50,
        inflatedValue: 49,
        ceilingValue: 56,
        contemplatedPrice: 8,
        remainingBudget: 80,
        slotsLeft: 10,
        signed: [{ position: 'RB' }],
      }),
    );
    expect(advice.verdict).toBe('take');
    expect(advice.reason).toMatch(/\$8/);
  });
});

import { describe, expect, it } from 'vitest';
import { recommendAuctionLot } from '../lot-advice.js';

const roster = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0 };

describe('recommendAuctionLot', () => {
  it('tells Hero RB to take an RB1 at fair with an empty roster', () => {
    const advice = recommendAuctionLot({
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
    });
    expect(advice.verdict).toBe('take');
    expect(advice.headline).toMatch(/take/i);
    expect(advice.reason).toMatch(/Hero RB/i);
    expect(advice.reason).toMatch(/RB/i);
    expect(advice.reason).toMatch(/\$42/);
  });

  it('tells Balanced to pass on an early QB', () => {
    const advice = recommendAuctionLot({
      strategyId: 'balanced',
      position: 'QB',
      playerName: 'Josh Allen',
      fairValue: 28,
      inflatedValue: 28,
      ceilingValue: 35,
      signed: [],
      remainingBudget: 200,
      slotsLeft: 13,
      roster,
    });
    expect(advice.verdict).toBe('pass');
    expect(advice.headline).toMatch(/let him go|pass/i);
    expect(advice.reason).toMatch(/Balanced/i);
    expect(advice.reason).toMatch(/QB/i);
  });

  it('passes when the price would leave less than $1 per remaining spot', () => {
    const advice = recommendAuctionLot({
      strategyId: 'hero_rb',
      position: 'RB',
      playerName: 'Star RB',
      fairValue: 40,
      inflatedValue: 195,
      ceilingValue: 60,
      signed: [],
      remainingBudget: 200,
      slotsLeft: 13,
      roster,
    });
    expect(advice.verdict).toBe('pass');
    expect(advice.reason).toMatch(/budget|spot/i);
  });

  it('passes on a third RB once Hero RB already has its anchor pair and the price is rich', () => {
    const advice = recommendAuctionLot({
      strategyId: 'hero_rb',
      position: 'RB',
      playerName: 'Handcuff RB',
      fairValue: 12,
      inflatedValue: 22,
      ceilingValue: 18,
      signed: [{ position: 'RB' }, { position: 'WR' }],
      remainingBudget: 140,
      slotsLeft: 11,
      roster,
    });
    expect(advice.verdict).toBe('pass');
    expect(advice.reason).toMatch(/already|fade|WR/i);
  });
});

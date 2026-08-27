import { describe, expect, it } from 'vitest';
import {
  applyBidToBudgets,
  applyInflation,
  computeDollarValues,
  computeInflationRate,
  computeMaxBid,
  DEFAULT_CONTRACT_RULES,
  dropPenaltyAmount,
  initTeamBudgets,
  suggestNominations,
  valueContract,
} from '../index.js';
import type { MultiYearCurve } from '@draftlab/domain';

describe('dollar values', () => {
  it('assigns more dollars to higher VORP and leaves stub room', () => {
    const values = computeDollarValues(
      [
        { playerId: 'a', position: 'WR', draftScore: 90, vorp: 300 },
        { playerId: 'b', position: 'RB', draftScore: 70, vorp: 120 },
        { playerId: 'c', position: 'QB', draftScore: 55, vorp: 40 },
      ],
      { teamCount: 12, budgetPerTeam: 200, rosterSlots: 15 },
    );
    expect(values[0]!.playerId).toBe('a');
    expect(values[0]!.fairValue).toBeGreaterThan(values[1]!.fairValue);
    const sum = values.reduce((s, v) => s + v.fairValue, 0);
    expect(sum).toBeLessThanOrEqual(12 * (200 - 15) + values.length); // stubs reserved
  });
});

describe('inflation + max bid', () => {
  it('raises remaining prices after overspend', () => {
    const values = computeDollarValues(
      [
        { playerId: 'a', position: 'WR', draftScore: 90, vorp: 300 },
        { playerId: 'b', position: 'RB', draftScore: 70, vorp: 120 },
        { playerId: 'c', position: 'TE', draftScore: 60, vorp: 80 },
      ],
      { teamCount: 10, budgetPerTeam: 200, rosterSlots: 15 },
    );
    const fairA = values.find((v) => v.playerId === 'a')!.fairValue;
    const rate = computeInflationRate([{ playerId: 'a', rosterId: 't1', amount: fairA + 40 }], values);
    expect(rate).toBeGreaterThan(0);
    const inflated = applyInflation(values, rate, new Set(['a']));
    const b = inflated.find((v) => v.playerId === 'b')!;
    expect(b.inflatedValue).toBeGreaterThanOrEqual(b.fairValue);
  });

  it('max bid leaves $1 for each remaining slot', () => {
    const max = computeMaxBid({ playerId: 'x', remainingBudget: 50, slotsLeft: 5 });
    expect(max.maxBid).toBe(46);
    expect(max.reserveForRest).toBe(4);
  });
});

describe('nominations + contracts + budgets', () => {
  it('suggests drain when rivals still have cash', () => {
    const values = [
      { playerId: 'star', fairValue: 60, inflatedValue: 60, vorpShare: 0.2 },
      { playerId: 'tgt', fairValue: 40, inflatedValue: 40, vorpShare: 0.12 },
    ];
    const tips = suggestNominations({
      values,
      availableIds: new Set(['star', 'tgt']),
      targets: new Set(['tgt']),
      avoids: new Set(),
      rivalRemaining: [120, 90],
      userRemaining: 100,
    });
    expect(tips.some((t) => t.kind === 'drain')).toBe(true);
  });

  it('values multi-year contracts against the curve', () => {
    const curve: MultiYearCurve = {
      playerId: 'p',
      npv: 200,
      peakYearOffset: 1,
      contendWindow: { start: 0, end: 3 },
      points: [
        { yearOffset: 0, season: 2025, value: 80, productionWeight: 1, assetWeight: 0.4 },
        { yearOffset: 1, season: 2026, value: 75, productionWeight: 0.85, assetWeight: 0.5 },
        { yearOffset: 2, season: 2027, value: 60, productionWeight: 0.7, assetWeight: 0.6 },
        { yearOffset: 3, season: 2028, value: 45, productionWeight: 0.55, assetWeight: 0.7 },
      ],
    };
    const deal = valueContract({
      playerId: 'p',
      annualSalary: 50,
      years: 4,
      curve,
      rules: DEFAULT_CONTRACT_RULES,
    });
    expect(deal.yearProjections).toHaveLength(4);
    expect(deal.deadCapOnRelease).toBe(25);
  });

  it('charges year-based drop penalties rounded up', () => {
    const rules = {
      ...DEFAULT_CONTRACT_RULES,
      maxLength: 5,
      dropPenaltyPctByYear: { 2: 0.5, 3: 0.25, 4: 0.15 },
    };
    expect(dropPenaltyAmount({ currentSalary: 8, contractYear: 2, rules })).toBe(4);
    expect(dropPenaltyAmount({ currentSalary: 12, contractYear: 3, rules })).toBe(3);
    expect(dropPenaltyAmount({ currentSalary: 15, contractYear: 4, rules })).toBe(3);
    expect(dropPenaltyAmount({ currentSalary: 29, contractYear: 5, rules })).toBe(0);
    expect(dropPenaltyAmount({ currentSalary: 17, contractYear: 1, rules })).toBe(0);
  });

  it('escalates salary on multi-year contracts when growth is configured', () => {
    const curve: MultiYearCurve = {
      playerId: 'p',
      npv: 200,
      peakYearOffset: 1,
      contendWindow: { start: 0, end: 3 },
      points: [
        { yearOffset: 0, season: 2026, value: 80, productionWeight: 1, assetWeight: 0.4 },
        { yearOffset: 1, season: 2027, value: 75, productionWeight: 0.85, assetWeight: 0.5 },
        { yearOffset: 2, season: 2028, value: 60, productionWeight: 0.7, assetWeight: 0.6 },
      ],
    };
    const deal = valueContract({
      playerId: 'p',
      annualSalary: 2,
      years: 3,
      curve,
      rules: { ...DEFAULT_CONTRACT_RULES, salaryGrowth: [1.5, 1.25] },
    });
    expect(deal.yearProjections.map((y) => y.salary)).toEqual([2, 3, 4]);
  });

  it('tracks team budgets after bids', () => {
    let budgets = initTeamBudgets(
      [
        { rosterId: 'u', name: 'You' },
        { rosterId: 'r', name: 'Rival' },
      ],
      200,
      15,
    );
    budgets = applyBidToBudgets(budgets, { playerId: 'a', rosterId: 'u', amount: 55 });
    expect(budgets[0]!.remaining).toBe(145);
    expect(budgets[0]!.rosterSlotsFilled).toBe(1);
  });
});

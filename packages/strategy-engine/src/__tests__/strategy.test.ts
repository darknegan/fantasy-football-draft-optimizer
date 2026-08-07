import { describe, expect, it } from 'vitest';
import { getStrategy, listStrategies } from '../strategies.js';
import { strategyFitMultiplier, classifyFit } from '../fit.js';
import { getDraftSlotInfo, snakePickNumbers } from '../slots.js';
import { isTeDeadZone, isQbSweetSpot } from '../round-rates.js';
import { scoreAdherence } from '../adherence.js';

describe('strategies', () => {
  it('defaults Balanced as S-tier and first in list', () => {
    const list = listStrategies();
    expect(list[0]?.id).toBe('balanced');
    expect(getStrategy('balanced').tier).toBe('S');
  });

  it('marks Zero RB and Elite QB as unrated', () => {
    expect(getStrategy('zero_rb').tier).toBe('unrated');
    expect(getStrategy('elite_qb').tier).toBe('unrated');
  });

  it('Elite TE targets rounds 2–3 and avoids round 4', () => {
    expect(classifyFit('elite_te', 2, 'TE')).toBe('primary');
    expect(classifyFit('elite_te', 3, 'TE')).toBe('primary');
    expect(classifyFit('elite_te', 4, 'TE')).toBe('avoid');
    expect(isTeDeadZone(4)).toBe(true);
  });

  it('applies heavy avoid multiplier for round-4 TE', () => {
    expect(strategyFitMultiplier('balanced', 4, 'TE')).toBe(0.6);
  });

  it('nudges Elite QB toward rounds 3–4', () => {
    expect(classifyFit('elite_qb', 1, 'QB')).toBe('avoid');
    expect(classifyFit('elite_qb', 2, 'QB')).toBe('avoid');
    expect(classifyFit('elite_qb', 3, 'QB')).toBe('primary');
    expect(isQbSweetSpot(3)).toBe(true);
  });
});

describe('draft slots', () => {
  it('tiers mid-round slots as C (worst leverage)', () => {
    expect(getDraftSlotInfo(6).tier).toBe('C');
    expect(getDraftSlotInfo(7).tier).toBe('C');
    expect(getDraftSlotInfo(1).tier).toBe('S');
  });

  it('computes snake pick numbers for slot 3 in 12-team', () => {
    expect(snakePickNumbers(3, 12, 3)).toEqual([3, 22, 27]);
  });
});

describe('adherence', () => {
  it('flags drifting after two off-plan picks', () => {
    const result = scoreAdherence('balanced', [
      { round: 1, position: 'QB' },
      { round: 2, position: 'QB' },
      { round: 3, position: 'RB' },
    ]);
    expect(result.state).toBe('drifting');
  });
});

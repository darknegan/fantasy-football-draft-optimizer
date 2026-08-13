import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANK_BANDS,
  DEFAULT_VOLUME_BANDS,
  GRADE_WEIGHTS,
  CEILING_RANGE,
} from '../config/grade-weights.js';
import { gradeByRatio, gradeInjuryConcern, gradeArchetypeFactor } from '../grade-factor.js';

describe('six-band weights', () => {
  it('uses elite/critical extremes', () => {
    expect(GRADE_WEIGHTS.elite).toBe(5);
    expect(GRADE_WEIGHTS.green).toBe(3);
    expect(GRADE_WEIGHTS.yellow).toBe(1);
    expect(GRADE_WEIGHTS.orange).toBe(-1);
    expect(GRADE_WEIGHTS.red).toBe(-3);
    expect(GRADE_WEIGHTS.critical).toBe(-5);
    expect(GRADE_WEIGHTS.unknown).toBe(0);
  });

  it('CEILING_RANGE uses ±5', () => {
    expect(CEILING_RANGE.WR.max).toBe(17 * 5);
    expect(CEILING_RANGE.WR.min).toBe(17 * -5);
    expect(CEILING_RANGE.QB.max).toBe(12 * 5);
    expect(CEILING_RANGE.RB.max).toBe(16 * 5);
    expect(CEILING_RANGE.TE.max).toBe(13 * 5);
  });
});

describe('volume bands', () => {
  const b = DEFAULT_VOLUME_BANDS;
  it('elite at 1.15', () => {
    expect(gradeByRatio(1.15, 1, 'higherBetter', b)).toBe('elite');
    expect(gradeByRatio(1.149, 1, 'higherBetter', b)).toBe('green');
  });
  it('critical below 0.50', () => {
    expect(gradeByRatio(0.49, 1, 'higherBetter', b)).toBe('critical');
    expect(gradeByRatio(0.5, 1, 'higherBetter', b)).toBe('red');
  });
});

describe('rank bands', () => {
  const b = DEFAULT_RANK_BANDS;
  it('elite at ratio 1.50', () => {
    // bench=12, value=8 → ratio 1.5 → elite
    expect(gradeByRatio(8, 12, 'lowerBetter', b)).toBe('elite');
    // 12/8.1 ≈ 1.481 → green
    expect(gradeByRatio(8.1, 12, 'lowerBetter', b)).toBe('green');
  });
  it('does not elite a mild beat that volume would', () => {
    // ratio 1.2 with rank bands → green, not elite
    expect(gradeByRatio(10, 12, 'lowerBetter', b)).toBe('green');
  });
});

describe('categorical grades', () => {
  it('injury serious is red not critical', () => {
    expect(gradeInjuryConcern('serious')).toBe('red');
  });
  it('allows the ELITE archetype to use the elite band', () => {
    expect(gradeArchetypeFactor('ELITE')).toBe('elite');
  });
});

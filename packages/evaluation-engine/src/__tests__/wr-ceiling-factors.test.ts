import { describe, expect, it } from 'vitest';
import { getBenchmarkConfig } from '../config/benchmarks.js';
import { CEILING_RANGE } from '../config/grade-weights.js';
import { gradeFactor, gradeInjuryConcern } from '../grade-factor.js';

describe('injury ceiling soft-cap', () => {
  it('grades serious as concerned when softCapSerious is true', () => {
    expect(gradeInjuryConcern('serious', { softCapSerious: true })).toBe('orange');
    expect(gradeInjuryConcern('serious')).toBe('red');
  });

  it('applies the soft-cap in ceiling factor grading', () => {
    const graded = gradeFactor(
      {
        id: 'injury_concern',
        label: 'Injury Concern',
        category: 'profile',
        direction: 'lowerBetter',
        benchmark: 1,
        categorical: 'injuryConcern',
      },
      { factorId: 'injury_concern', value: 1, categorical: 'serious' },
      { greenMin: 1.05, yellowMin: 0.9, orangeMin: 0.75 },
    );

    expect(graded.grade).toBe('orange');
    expect(graded.weight).toBe(-1);
  });
});

describe('WR ceiling config', () => {
  it('includes route_participation and known-factor range for 10', () => {
    const cfg = getBenchmarkConfig('WR', 2025);
    expect(cfg.factors.some((factor) => factor.id === 'route_participation')).toBe(true);
    expect(CEILING_RANGE.WR.max).toBe(50);
    expect(CEILING_RANGE.WR.min).toBe(-30);
  });
});

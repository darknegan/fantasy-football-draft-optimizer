import { describe, expect, it } from 'vitest';
import type { PositionBenchmarkConfig } from '@draftlab/domain';
import { computeCeilingScore } from '../ceiling.js';
import { getBenchmarkConfig } from '../config/benchmarks.js';
import {
  CEILING_RANGE,
  DEFAULT_RANK_BANDS,
  DEFAULT_VOLUME_BANDS,
} from '../config/grade-weights.js';
import { gradeFactor, gradeInjuryConcern } from '../grade-factor.js';

describe('injury ceiling soft-cap', () => {
  it('grades serious as concerned when softCapSerious is true', () => {
    expect(gradeInjuryConcern('serious', { softCapSerious: true })).toBe('orange');
    expect(gradeInjuryConcern('serious')).toBe('red');
  });

  const injuryFactor = {
    id: 'injury_concern',
    label: 'Injury Concern',
    category: 'profile',
    direction: 'lowerBetter',
    benchmark: 1,
    categorical: 'injuryConcern',
  } as const;
  const seriousInjury = {
    factorId: 'injury_concern',
    value: 1,
    categorical: 'serious',
  } as const;

  it('defaults gradeFactor serious injuries to red', () => {
    expect(
      gradeFactor(injuryFactor, seriousInjury, DEFAULT_VOLUME_BANDS, DEFAULT_RANK_BANDS).grade,
    ).toBe('red');
  });

  it('soft-caps serious injuries only when explicitly requested', () => {
    const graded = gradeFactor(
      injuryFactor,
      seriousInjury,
      DEFAULT_VOLUME_BANDS,
      DEFAULT_RANK_BANDS,
      {
        softCapSerious: true,
      },
    );

    expect(graded.grade).toBe('orange');
    expect(graded.weight).toBe(-1);
  });

  it('requests the serious-injury soft-cap from the ceiling path', () => {
    const config: PositionBenchmarkConfig = {
      position: 'WR',
      season: 2025,
      provisional: false,
      volumeBands: { ...DEFAULT_VOLUME_BANDS },
      rankBands: { ...DEFAULT_RANK_BANDS },
      factors: [injuryFactor],
    };

    const result = computeCeilingScore('WR', [seriousInjury], { config });

    expect(result.factors[0]?.grade).toBe('orange');
  });
});

describe('WR ceiling config', () => {
  it('includes route_participation and known-factor range for 17', () => {
    const cfg = getBenchmarkConfig('WR', 2025);
    expect(cfg.factors.some((factor) => factor.id === 'route_participation')).toBe(true);
    expect(CEILING_RANGE.WR.max).toBe(85);
    expect(CEILING_RANGE.WR.min).toBe(-51);
  });
});

import { describe, expect, it } from 'vitest';
import { getBenchmarkConfig } from '../config/benchmarks.js';
import { CEILING_RANGE } from '../config/grade-weights.js';

describe('ceiling catalog', () => {
  it('QB catalog uses pass_epa_rank and 12 known slots', () => {
    const ids = getBenchmarkConfig('QB').factors.map((f) => f.id);
    expect(ids).toContain('pass_epa_rank');
    expect(ids).not.toContain('pass_dvoa_rank');
    expect(ids).toHaveLength(12);
    expect(CEILING_RANGE.QB.max).toBe(12 * 5);
  });

  it('TE catalog uses yprr and drops licensed ids', () => {
    const ids = getBenchmarkConfig('TE').factors.map((f) => f.id);
    expect(ids).toContain('yprr');
    expect(ids).not.toContain('yprr_rank');
    expect(ids).not.toContain('inline_pct');
    expect(ids).toHaveLength(13);
    expect(CEILING_RANGE.TE.max).toBe(13 * 5);
  });
});

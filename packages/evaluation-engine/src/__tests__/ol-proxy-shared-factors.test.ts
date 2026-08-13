import { describe, expect, it } from 'vitest';
import { BENCHMARKS_2025 } from '../config/benchmarks.js';
import { CEILING_RANGE } from '../config/grade-weights.js';
import { computeCeilingScore } from '../ceiling.js';

describe('ITEM-006 factor lists', () => {
  it('QB has injury_concern and no adp', () => {
    const ids = BENCHMARKS_2025.QB.factors.map((f) => f.id);
    expect(ids).toContain('injury_concern');
    expect(ids).not.toContain('adp');
    expect(ids).toContain('ol_pass_block_rank');
  });

  it('WR and TE have neutral_pace_rank; TE has ol_pass_block_rank', () => {
    expect(BENCHMARKS_2025.WR.factors.map((f) => f.id)).toContain('neutral_pace_rank');
    expect(BENCHMARKS_2025.TE.factors.map((f) => f.id)).toContain('neutral_pace_rank');
    expect(BENCHMARKS_2025.TE.factors.map((f) => f.id)).toContain('ol_pass_block_rank');
  });

  it('OL labels say proxy', () => {
    const qbOl = BENCHMARKS_2025.QB.factors.find((f) => f.id === 'ol_pass_block_rank')!;
    const rbOl = BENCHMARKS_2025.RB.factors.find((f) => f.id === 'ol_run_block_rank')!;
    expect(qbOl.label.toLowerCase()).toContain('proxy');
    expect(rbOl.label.toLowerCase()).toContain('proxy');
  });

  it('computeCeilingScore has no adp factor', () => {
    const result = computeCeilingScore('QB', []);
    expect(result.factors.find((f) => f.factorId === 'adp')).toBeUndefined();
  });

  it('known-factor ranges match ITEM-006 coverage', () => {
    expect(CEILING_RANGE.QB.max).toBe(12 * 5);
    expect(CEILING_RANGE.RB.max).toBe(16 * 5);
    expect(CEILING_RANGE.TE.max).toBe(13 * 5);
    expect(CEILING_RANGE.WR.max).toBe(17 * 5);
  });
});

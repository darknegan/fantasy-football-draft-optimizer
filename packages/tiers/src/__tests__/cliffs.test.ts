import { describe, expect, it } from 'vitest';
import { detectCliffs, DEFAULT_CLIFF_K } from '../cliffs.js';

describe('detectCliffs', () => {
  it('flags a gap that is k times the median gap', () => {
    // gaps: 1, 1, 8, 1  → median 1 → threshold 5 → only the 8 qualifies
    const cliffs = detectCliffs([50, 49, 48, 40, 39]);
    expect(cliffs).toHaveLength(1);
    expect(cliffs[0]!.afterIndex).toBe(2);
    expect(cliffs[0]!.gap).toBe(8);
    expect(cliffs[0]!.multiple).toBe(8);
  });

  it('finds nothing in a uniformly spaced list', () => {
    expect(detectCliffs([50, 45, 40, 35, 30])).toEqual([]);
  });

  it('scales to the data rather than using an absolute cut-off', () => {
    // Same shape as the first case, but compressed 10x. A fixed point threshold
    // would miss this entirely; the median rule must still find it.
    const cliffs = detectCliffs([5.0, 4.9, 4.8, 4.0, 3.9]);
    expect(cliffs).toHaveLength(1);
    expect(cliffs[0]!.afterIndex).toBe(2);
  });

  it('returns no cliffs when every score is identical', () => {
    expect(detectCliffs([40, 40, 40, 40])).toEqual([]);
  });

  it('falls back to the mean of nonzero gaps when the median gap is zero', () => {
    // gaps: 0, 0, 0, 9 → median 0, so the median rule would divide by zero.
    // Mean of nonzero gaps = 9 → threshold 45 → 9 does not clear it.
    const cliffs = detectCliffs([40, 40, 40, 40, 31]);
    expect(cliffs).toEqual([]);
    // With a low k the same gap does clear the fallback threshold.
    const sensitive = detectCliffs([40, 40, 40, 40, 31], 0.5);
    expect(sensitive).toHaveLength(1);
    expect(sensitive[0]!.afterIndex).toBe(3);
  });

  it('handles degenerate input', () => {
    expect(detectCliffs([])).toEqual([]);
    expect(detectCliffs([42])).toEqual([]);
  });

  it('accepts a custom k', () => {
    const strict = detectCliffs([50, 49, 48, 40, 39], 20);
    expect(strict).toEqual([]);
  });

  it('exposes a documented default k', () => {
    expect(DEFAULT_CLIFF_K).toBe(5);
  });
});

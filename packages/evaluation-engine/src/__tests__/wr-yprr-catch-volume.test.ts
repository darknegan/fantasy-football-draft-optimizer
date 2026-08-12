import { describe, expect, it } from 'vitest';
import { getBenchmarkConfig } from '../config/benchmarks.js';
import { CEILING_RANGE } from '../config/grade-weights.js';

describe('WR yprr / catch% / volume (ITEM-005)', () => {
  it('exposes new volume factors and proxy labels', () => {
    const wr = getBenchmarkConfig('WR', 2025).factors;
    const byId = Object.fromEntries(wr.map((f) => [f.id, f]));
    expect(byId['yards_per_catch']?.category).toBe('volume');
    expect(byId['yac_per_reception']?.category).toBe('volume');
    expect(byId['target_share']?.category).toBe('volume');
    expect(byId['yprr']!.label.toLowerCase()).toContain('proxy');
    expect(byId['reception_perception']!.label.toLowerCase()).toMatch(/catch|ngs|proxy/i);
    expect(byId['yards_per_catch']!.benchmark).toBeGreaterThan(0);
    expect(byId['reception_perception']!.benchmark).not.toBe(90);
    expect(byId['yards_per_catch']!.benchmark).toBe(13.772);
    expect(byId['yac_per_reception']!.benchmark).toBe(4.773);
    expect(byId['target_share']!.benchmark).toBe(0.299);
    expect(byId['yprr']!.benchmark).toBe(2.739);
    expect(byId['reception_perception']!.benchmark).toBe(68.864);
  });

  it('bumps WR known ceiling factors to 17', () => {
    expect(CEILING_RANGE.WR.max).toBe(17 * 5);
    expect(CEILING_RANGE.WR.min).toBe(17 * -5);
  });
});

import { describe, expect, it } from 'vitest';
import type { Position } from '../../core/api.types';
import {
  configuredFactorCount,
  isTop5Ceiling,
  top5CeilingIdsByPosition,
  type CeilingDisplayRow,
} from './ceiling-display';

function row(opts: {
  id: string;
  position: Position;
  ceilingScore?: number | null;
  provisional?: boolean;
  factorCount?: number;
}): CeilingDisplayRow {
  const n = opts.factorCount ?? 0;
  return {
    player: { id: opts.id, position: opts.position },
    evaluation: {
      ceiling: {
        ceilingScore: opts.ceilingScore ?? null,
        provisional: opts.provisional ?? false,
        factors: n > 0 ? { length: n } : [],
      },
    },
  };
}

describe('configuredFactorCount', () => {
  it('uses factors.length when the catalog payload is present', () => {
    expect(configuredFactorCount(row({ id: 'w', position: 'WR', factorCount: 17 }))).toBe(17);
    expect(configuredFactorCount(row({ id: 't', position: 'TE', factorCount: 13 }))).toBe(13);
  });

  it('falls back to POSITION_CATALOG_COUNT when factors are empty', () => {
    expect(configuredFactorCount(row({ id: 'q', position: 'QB' }))).toBe(12);
    expect(configuredFactorCount(row({ id: 'r', position: 'RB' }))).toBe(16);
    expect(configuredFactorCount(row({ id: 't', position: 'TE' }))).toBe(13);
    expect(configuredFactorCount(row({ id: 'w', position: 'WR' }))).toBe(17);
  });
});

describe('top5CeilingIdsByPosition', () => {
  it('greens the top 5 raw ceiling scores at a position', () => {
    const rows = [40, 35, 30, 25, 20, 15, 10].map((score, i) =>
      row({ id: `wr${i}`, position: 'WR', ceilingScore: score }),
    );
    const ids = top5CeilingIdsByPosition(rows);
    expect([...ids].sort()).toEqual(['wr0', 'wr1', 'wr2', 'wr3', 'wr4']);
  });

  it('includes everyone tied at the cutoff score', () => {
    const rows = [40, 35, 30, 25, 20, 20, 10].map((score, i) =>
      row({ id: `wr${i}`, position: 'WR', ceilingScore: score }),
    );
    const ids = top5CeilingIdsByPosition(rows);
    expect(ids.has('wr4')).toBe(true);
    expect(ids.has('wr5')).toBe(true);
    expect(ids.has('wr6')).toBe(false);
    expect(ids.size).toBe(6);
  });

  it('excludes provisional and null-score rows from the top-5 set', () => {
    const rows = [
      row({ id: 'prov', position: 'QB', ceilingScore: 99, provisional: true }),
      row({ id: 'nulls', position: 'QB', ceilingScore: null }),
      row({ id: 'q0', position: 'QB', ceilingScore: 12 }),
      row({ id: 'q1', position: 'QB', ceilingScore: 11 }),
    ];
    const ids = top5CeilingIdsByPosition(rows);
    expect(ids.has('prov')).toBe(false);
    expect(ids.has('nulls')).toBe(false);
    expect(ids.has('q0')).toBe(true);
    expect(ids.has('q1')).toBe(true);
  });

  it('scopes top-5 per position, not overall board', () => {
    const rows = [
      row({ id: 'wr-high', position: 'WR', ceilingScore: 40 }),
      row({ id: 'qb-low', position: 'QB', ceilingScore: 8 }),
    ];
    const ids = top5CeilingIdsByPosition(rows);
    expect(ids.has('wr-high')).toBe(true);
    expect(ids.has('qb-low')).toBe(true);
  });

  it('computes from the full universe so a filtered view does not green extras', () => {
    const all = [40, 35, 30, 25, 20, 15].map((score, i) =>
      row({ id: `wr${i}`, position: 'WR', ceilingScore: score }),
    );
    const filteredOnly = all.slice(0, 5);
    const fromFull = top5CeilingIdsByPosition(all);
    const fromFiltered = top5CeilingIdsByPosition(filteredOnly);
    expect(fromFull.has('wr5')).toBe(false);
    expect(fromFiltered.has('wr4')).toBe(true);
    expect(fromFull.has('wr4')).toBe(true);
  });
});

describe('isTop5Ceiling', () => {
  it('looks up the precomputed id set', () => {
    const rows = [40, 35, 30, 25, 20, 5].map((score, i) =>
      row({ id: `rb${i}`, position: 'RB', ceilingScore: score }),
    );
    const ids = top5CeilingIdsByPosition(rows);
    expect(isTop5Ceiling(rows[0]!, ids)).toBe(true);
    expect(isTop5Ceiling(rows[5]!, ids)).toBe(false);
  });
});

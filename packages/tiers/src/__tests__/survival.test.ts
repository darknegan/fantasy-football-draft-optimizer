import { describe, expect, it } from 'vitest';
import type { TierRow } from '../types.js';
import { adpOverall, estimateSurvivalProbability, survivalBands } from '../survival.js';

const row = (id: string, adpRoundPick: string): TierRow => ({
  id,
  position: 'RB',
  draftScore: 70,
  ceilingKnownFactors: 5,
  adpRoundPick,
});

describe('adpOverall', () => {
  it('converts round.pick notation to an overall pick number', () => {
    expect(adpOverall('1.01', 12)).toBe(1);
    expect(adpOverall('1.12', 12)).toBe(12);
    expect(adpOverall('2.01', 12)).toBe(13);
    expect(adpOverall('3.05', 10)).toBe(25);
  });

  it('returns null for unparseable input rather than a late-round sentinel', () => {
    // The old 999 sentinel silently read as "very late", fabricating a survival
    // claim for players we have no ADP for at all.
    expect(adpOverall('', 12)).toBeNull();
    expect(adpOverall('n/a', 12)).toBeNull();
    expect(adpOverall('12', 12)).toBeNull();
  });
});

describe('survivalBands', () => {
  it('separates players by survival probability into three bands', () => {
    const rows = [row('early', '1.01'), row('near', '2.09'), row('late', '9.01')];
    const bands = survivalBands(rows, 21, 8, 12);
    const idsIn = (bandId: string) =>
      bands.find((b) => b.id === bandId)?.rows.map((r) => r.id) ?? [];

    expect(idsIn('gone')).toContain('early');
    expect(idsIn('available')).toContain('late');
  });

  it('routes unparseable ADP to its own band, never to available', () => {
    const rows = [row('known', '1.01'), row('unknown', '—')];
    const bands = survivalBands(rows, 21, 8, 12);
    const unknownBand = bands.find((b) => b.id === 'adp-unknown');

    expect(unknownBand?.rows.map((r) => r.id)).toEqual(['unknown']);
    expect(bands.find((b) => b.id === 'available')?.rows ?? []).not.toContainEqual(
      expect.objectContaining({ id: 'unknown' }),
    );
  });

  it('omits empty bands', () => {
    const bands = survivalBands([row('a', '1.01')], 21, 8, 12);
    expect(bands.every((b) => b.rows.length > 0)).toBe(true);
  });

  it('preserves input order within a band', () => {
    const rows = [row('a', '9.01'), row('b', '9.02'), row('c', '9.03')];
    const bands = survivalBands(rows, 21, 8, 12);
    const available = bands.find((b) => b.id === 'available');
    expect(available?.rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns no bands for an empty pool', () => {
    expect(survivalBands([], 21, 8, 12)).toEqual([]);
  });

  it('handles being on the clock', () => {
    const bands = survivalBands([row('a', '1.01')], 1, 0, 12);
    expect(bands.length).toBeGreaterThan(0);
  });
});

describe('estimateSurvivalProbability (relocated, behaviour unchanged)', () => {
  it('rates a later ADP as more likely to survive than an earlier one', () => {
    const early = estimateSurvivalProbability({
      adpOverall: 5,
      nextUserPickOverall: 20,
      picksUntilNext: 10,
    });
    const late = estimateSurvivalProbability({
      adpOverall: 40,
      nextUserPickOverall: 20,
      picksUntilNext: 10,
    });
    expect(late).toBeGreaterThan(early);
  });
});

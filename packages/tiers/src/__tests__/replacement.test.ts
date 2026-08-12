import { describe, expect, it } from 'vitest';
import type { RosterShape } from '@draftlab/domain';
import { replacementBand } from '../replacement.js';

const roster: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  bench: 6,
  totalStarters: 7,
};

describe('replacementBand', () => {
  it('splits starter slots into one band per slot index', () => {
    // 12 teams x 2 RB slots → ranks 1-12 are RB1, 13-24 are RB2.
    expect(replacementBand(1, 'RB', roster, 12).id).toBe('RB1');
    expect(replacementBand(12, 'RB', roster, 12).id).toBe('RB1');
    expect(replacementBand(13, 'RB', roster, 12).id).toBe('RB2');
    expect(replacementBand(24, 'RB', roster, 12).id).toBe('RB2');
  });

  it('places players past the starter bands into flex', () => {
    // 24 starter RB slots + 12 flex slots → ranks 25-36 are FLEX.
    expect(replacementBand(25, 'RB', roster, 12).id).toBe('FLEX');
    expect(replacementBand(36, 'RB', roster, 12).id).toBe('FLEX');
  });

  it('places players past flex onto the bench', () => {
    expect(replacementBand(37, 'RB', roster, 12).id).toBe('BENCH');
    expect(replacementBand(200, 'RB', roster, 12).id).toBe('BENCH');
  });

  it('does not grant flex eligibility to QB', () => {
    // 1 QB slot x 12 teams → rank 13 is already bench, not flex.
    expect(replacementBand(12, 'QB', roster, 12).id).toBe('QB1');
    expect(replacementBand(13, 'QB', roster, 12).id).toBe('BENCH');
  });

  it('extends QB bands by superflex slots', () => {
    const superflexRoster: RosterShape = { ...roster, superflex: 1 };
    // 1 QB + 1 superflex = 2 QB bands → rank 13 is QB2, not bench.
    expect(replacementBand(13, 'QB', superflexRoster, 12).id).toBe('QB2');
    expect(replacementBand(24, 'QB', superflexRoster, 12).id).toBe('QB2');
    expect(replacementBand(25, 'QB', superflexRoster, 12).id).toBe('BENCH');
  });

  it('scales with team count', () => {
    expect(replacementBand(11, 'RB', roster, 10).id).toBe('RB2');
    expect(replacementBand(11, 'RB', roster, 12).id).toBe('RB1');
  });

  it('is independent of the visible pool — rank alone determines the band', () => {
    expect(replacementBand(5, 'WR', roster, 12).id).toBe('WR1');
    expect(replacementBand(5, 'WR', roster, 12).label).toBe('WR1');
  });

  it('degrades a non-positive rank to BENCH rather than emitting a malformed band', () => {
    // 1-indexed by contract. A 0-indexed off-by-one must not silently produce "RB0".
    expect(replacementBand(0, 'RB', roster, 12).id).toBe('BENCH');
    expect(replacementBand(-5, 'RB', roster, 12).id).toBe('BENCH');
  });

  it('degrades a non-finite rank to BENCH', () => {
    expect(replacementBand(Number.NaN, 'RB', roster, 12).id).toBe('BENCH');
    expect(replacementBand(Number.POSITIVE_INFINITY, 'RB', roster, 12).id).toBe('BENCH');
  });
});

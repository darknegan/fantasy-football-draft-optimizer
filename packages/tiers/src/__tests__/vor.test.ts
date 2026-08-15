import { describe, expect, it } from 'vitest';
import type { RosterShape } from '@draftlab/domain';
import { computeVor, startableCapacity } from '../replacement.js';

const roster1qb: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  bench: 6,
  totalStarters: 7,
};

const rosterSf: RosterShape = { ...roster1qb, superflex: 1 };

describe('startableCapacity', () => {
  it('counts dedicated starters plus flex for skill positions', () => {
    // 12 × 2 RB + 12 flex = 36 last startable RBs.
    expect(startableCapacity('RB', roster1qb, 12)).toBe(36);
    expect(startableCapacity('WR', roster1qb, 12)).toBe(36);
    expect(startableCapacity('TE', roster1qb, 12)).toBe(24);
  });

  it('does not grant flex to QB, but does count superflex', () => {
    expect(startableCapacity('QB', roster1qb, 12)).toBe(12);
    expect(startableCapacity('QB', rosterSf, 12)).toBe(24);
  });
});

describe('computeVor', () => {
  it('subtracts the last startable player at the position from raw proj', () => {
    // 2-team, 1 QB / 1 RB, no flex → replacement is rank 2 at each position.
    const tiny: RosterShape = { ...roster1qb, rb: 1, wr: 1, te: 1, flex: 0 };
    const vor = computeVor(
      [
        { id: 'allen', position: 'QB', projectedPoints: 400 },
        { id: 'baker', position: 'QB', projectedPoints: 300 },
        { id: 'gibbs', position: 'RB', projectedPoints: 350 },
        { id: 'handcuff', position: 'RB', projectedPoints: 200 },
      ],
      tiny,
      2,
    );

    expect(vor.get('allen')).toBe(100);
    expect(vor.get('baker')).toBe(0);
    expect(vor.get('gibbs')).toBe(150);
    expect(vor.get('handcuff')).toBe(0);
  });

  it('ranks a lower-proj RB above a higher-proj QB when VOR is larger', () => {
    const tiny: RosterShape = { ...roster1qb, rb: 1, wr: 1, te: 1, flex: 0 };
    const vor = computeVor(
      [
        { id: 'allen', position: 'QB', projectedPoints: 400 },
        { id: 'baker', position: 'QB', projectedPoints: 300 },
        { id: 'gibbs', position: 'RB', projectedPoints: 350 },
        { id: 'handcuff', position: 'RB', projectedPoints: 200 },
      ],
      tiny,
      2,
    );

    expect(vor.get('gibbs')!).toBeGreaterThan(vor.get('allen')!);
  });

  it('returns null VOR when projected points are missing', () => {
    const vor = computeVor(
      [{ id: 'rookie', position: 'WR', projectedPoints: null }],
      roster1qb,
      12,
    );
    expect(vor.get('rookie')).toBeNull();
  });

  it('uses the last available player as baseline when the pool is thinner than capacity', () => {
    const vor = computeVor(
      [
        { id: 'a', position: 'QB', projectedPoints: 380 },
        { id: 'b', position: 'QB', projectedPoints: 340 },
      ],
      roster1qb,
      12,
    );
    expect(vor.get('a')).toBe(40);
    expect(vor.get('b')).toBe(0);
  });
});

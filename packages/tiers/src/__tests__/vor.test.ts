import { describe, expect, it } from 'vitest';
import type { RosterShape } from '@draftlab/domain';
import {
  computeVor,
  resolveVorScoringFormat,
  startableCapacity,
} from '../replacement.js';

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
  it('splits flex once by PPR shares instead of giving every position the full pool', () => {
    // 12-team 2RB/2WR/1TE/1FLEX, PPR 25/65/10 → +3 RB, +8 WR, +1 TE.
    expect(startableCapacity('RB', roster1qb, 12, 'ppr')).toBe(27);
    expect(startableCapacity('WR', roster1qb, 12, 'ppr')).toBe(32);
    expect(startableCapacity('TE', roster1qb, 12, 'ppr')).toBe(13);
    expect(
      startableCapacity('RB', roster1qb, 12, 'ppr') +
        startableCapacity('WR', roster1qb, 12, 'ppr') +
        startableCapacity('TE', roster1qb, 12, 'ppr') -
        24 -
        24 -
        12,
    ).toBe(12);
  });

  it('gives WRs more flex in PPR than in half-PPR', () => {
    expect(startableCapacity('WR', roster1qb, 12, 'ppr')).toBeGreaterThan(
      startableCapacity('WR', roster1qb, 12, 'half_ppr'),
    );
    expect(startableCapacity('RB', roster1qb, 12, 'ppr')).toBeLessThan(
      startableCapacity('RB', roster1qb, 12, 'half_ppr'),
    );
  });

  it('does not grant flex to QB, but does count superflex', () => {
    expect(startableCapacity('QB', roster1qb, 12, 'ppr')).toBe(12);
    expect(startableCapacity('QB', rosterSf, 12, 'ppr')).toBe(24);
  });

  it('uses largest-remainder so flex extras always sum to the flex pool', () => {
    const extras = (teams: number, format: 'ppr' | 'half_ppr' | 'standard') =>
      startableCapacity('RB', roster1qb, teams, format) +
      startableCapacity('WR', roster1qb, teams, format) +
      startableCapacity('TE', roster1qb, teams, format) -
      teams * 2 -
      teams * 2 -
      teams;
    expect(extras(10, 'ppr')).toBe(10);
    expect(extras(10, 'half_ppr')).toBe(10);
    expect(extras(10, 'standard')).toBe(10);
  });

  it('uses half-PPR shares on a 12-team 1FLEX league', () => {
    expect(startableCapacity('RB', roster1qb, 12, 'half_ppr')).toBe(29);
    expect(startableCapacity('WR', roster1qb, 12, 'half_ppr')).toBe(30);
    expect(startableCapacity('TE', roster1qb, 12, 'half_ppr')).toBe(13);
  });

  it('defaults to PPR when format is omitted', () => {
    expect(startableCapacity('WR', roster1qb, 12)).toBe(32);
  });
});

describe('resolveVorScoringFormat', () => {
  it('prefers an explicit variant over reception points', () => {
    expect(resolveVorScoringFormat({ variant: 'standard', reception: 1 })).toBe('standard');
    expect(resolveVorScoringFormat({ variant: 'HALF_PPR' })).toBe('half_ppr');
  });

  it('maps reception points when variant is missing', () => {
    expect(resolveVorScoringFormat({ reception: 1 })).toBe('ppr');
    expect(resolveVorScoringFormat({ reception: 0.5 })).toBe('half_ppr');
    expect(resolveVorScoringFormat({ reception: 0 })).toBe('standard');
  });

  it('defaults to PPR when scoring is unknown', () => {
    expect(resolveVorScoringFormat({})).toBe('ppr');
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

  it('uses the PPR WR replacement rank, not the full flex pool', () => {
    const wrs = Array.from({ length: 36 }, (_, i) => ({
      id: `wr${i + 1}`,
      position: 'WR' as const,
      projectedPoints: 360 - i * 10,
    }));
    const vor = computeVor(wrs, roster1qb, 12, 'ppr');
    // PPR capacity is WR32 (proj 50), not WR36 (proj 10).
    expect(vor.get('wr1')).toBe(310);
    expect(vor.get('wr32')).toBe(0);
    expect(vor.get('wr36')).toBe(-40);
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

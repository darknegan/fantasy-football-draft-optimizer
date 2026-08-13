import type { Player, Position } from '@draftlab/domain';
import { describe, expect, it } from 'vitest';
import { classifyQb, classifyRb, classifyTe, classifyWr, evaluateArchetype } from '../archetype.js';
import { gradeArchetypeFactor } from '../grade-factor.js';

function p(overrides: Partial<Player> = {}): Player {
  const position: Position = overrides.position ?? 'WR';
  return {
    id: 'test-player',
    externalIds: {},
    name: 'Test Player',
    team: 'TST',
    position,
    age: 25,
    seasonsInLeague: 5,
    draftYear: 2021,
    draftRound: 2,
    status: 'active',
    positionalTop5FinishCount: 0,
    positionalTop8FinishCount: 0,
    positionalTop12FinishCount: 0,
    ...overrides,
  };
}

describe.each([
  ['RB', classifyRb],
  ['WR', classifyWr],
  ['TE', classifyTe],
] as const)('%s skill ladder', (position, classify) => {
  const player = (overrides: Partial<Player>) => p({ position, ...overrides });

  it('rule 1: <=3 seasons and no top-5 finishes is BREAKOUT', () => {
    expect(classify(player({ seasonsInLeague: 2, age: 23 }))).toBe('BREAKOUT_CANDIDATE');
  });

  it('rule 2: <=3 seasons and one top-5 finish is PROVEN', () => {
    expect(classify(player({ seasonsInLeague: 3, positionalTop5FinishCount: 1 }))).toBe(
      'PROVEN_BREAKOUT_CANDIDATE',
    );
  });

  it('rule 3: <=4 seasons and at least two top-5 finishes is ELITE', () => {
    expect(
      classify(
        player({
          seasonsInLeague: 4,
          positionalTop5FinishCount: 2,
          positionalTop8FinishCount: 2,
          positionalTop12FinishCount: 2,
        }),
      ),
    ).toBe('ELITE');
  });

  it('rule 4: >4 seasons and top-8 over half of seasons is ELITE', () => {
    expect(
      classify(
        player({
          seasonsInLeague: 6,
          positionalTop5FinishCount: 1,
          positionalTop8FinishCount: 4,
          positionalTop12FinishCount: 4,
        }),
      ),
    ).toBe('ELITE');
  });

  it('year 5-6 with two top-5 but failing half-rates is IN_THEIR_PRIME', () => {
    expect(
      classify(
        player({
          seasonsInLeague: 5,
          positionalTop5FinishCount: 2,
          positionalTop8FinishCount: 2,
          positionalTop12FinishCount: 2,
        }),
      ),
    ).toBe('IN_THEIR_PRIME');
  });

  it('rule 5: >4 seasons and top-12 over half (without top-8 half) is TRUSTY', () => {
    expect(
      classify(
        player({
          age: 28,
          seasonsInLeague: 7,
          positionalTop8FinishCount: 3,
          positionalTop12FinishCount: 4,
        }),
      ),
    ).toBe('TRUSTY_VETERAN');
    expect(
      classify(
        player({
          age: 27,
          seasonsInLeague: 7,
          positionalTop8FinishCount: 3,
          positionalTop12FinishCount: 4,
        }),
      ),
    ).toBe('TRUSTY_VETERAN');
  });

  it('rule 6: aging without half-rate pedigree is VETERAN', () => {
    expect(
      classify(
        player({
          age: 28,
          seasonsInLeague: 6,
          positionalTop8FinishCount: 2,
          positionalTop12FinishCount: 2,
        }),
      ),
    ).toBe('VETERAN');
  });

  it('young breakout takes precedence over the age gate', () => {
    expect(classify(player({ seasonsInLeague: 2, age: 28 }))).toBe('BREAKOUT_CANDIDATE');
  });
});

describe('QB ladder', () => {
  const qb = (overrides: Partial<Player>) => p({ position: 'QB', ...overrides });

  it('keeps heavy top-8 pedigree mid-career QBs ELITE', () => {
    expect(
      classifyQb(
        qb({
          age: 29,
          seasonsInLeague: 8,
          positionalTop5FinishCount: 5,
          positionalTop8FinishCount: 7,
          positionalTop12FinishCount: 7,
        }),
      ),
    ).toBe('ELITE');
  });

  it('uses age 34 for TRUSTY when top-12 half-rate holds without top-8 half', () => {
    expect(
      classifyQb(
        qb({
          age: 34,
          seasonsInLeague: 10,
          positionalTop8FinishCount: 4,
          positionalTop12FinishCount: 6,
        }),
      ),
    ).toBe('TRUSTY_VETERAN');
  });

  it('uses age 34 for a VETERAN without half-rate pedigree', () => {
    expect(
      classifyQb(
        qb({
          age: 34,
          seasonsInLeague: 10,
          positionalTop8FinishCount: 2,
          positionalTop12FinishCount: 3,
        }),
      ),
    ).toBe('VETERAN');
  });

  it('does not use year 7 as a QB veteran gate', () => {
    expect(
      classifyQb(
        qb({
          age: 32,
          seasonsInLeague: 10,
          positionalTop8FinishCount: 2,
          positionalTop12FinishCount: 3,
        }),
      ),
    ).toBe('IN_THEIR_PRIME');
  });

  it('applies rules 1-4 before the age gate', () => {
    expect(
      classifyQb(
        qb({
          age: 34,
          seasonsInLeague: 3,
          positionalTop5FinishCount: 2,
          positionalTop8FinishCount: 2,
          positionalTop12FinishCount: 2,
        }),
      ),
    ).toBe('ELITE');
  });
});

describe('interim archetype rates', () => {
  it('reuses former prime rates without volume blending', () => {
    const wr = p({
      position: 'WR',
      seasonsInLeague: 4,
      positionalTop5FinishCount: 2,
      positionalTop8FinishCount: 2,
      positionalTop12FinishCount: 2,
    });
    const lowVolume = evaluateArchetype(wr, [{ factorId: 'targets', value: 1 }]);
    const highVolume = evaluateArchetype(wr, [{ factorId: 'targets', value: 20 }]);

    expect(lowVolume.rates).toEqual(highVolume.rates);
    expect(lowVolume.rates.boomRate).toBe(0.338);
  });

  it('makes VETERAN rates provisional relative to TRUSTY_VETERAN', () => {
    const trusty = evaluateArchetype(
      p({
        age: 28,
        seasonsInLeague: 7,
        positionalTop8FinishCount: 3,
        positionalTop12FinishCount: 4,
        position: 'WR',
      }),
    );
    const veteran = evaluateArchetype(
      p({
        age: 28,
        positionalTop8FinishCount: 2,
        positionalTop12FinishCount: 2,
        position: 'WR',
      }),
    );

    expect(veteran.rates.injuryRate).toBeCloseTo(trusty.rates.injuryRate + 0.05);
    expect(veteran.rates.boomRate).toBeCloseTo(trusty.rates.boomRate - 0.05);
  });
});

describe('gradeArchetypeFactor', () => {
  it.each([
    ['ELITE', 'elite'],
    ['PROVEN_BREAKOUT_CANDIDATE', 'green'],
    ['TRUSTY_VETERAN', 'green'],
    ['IN_THEIR_PRIME', 'yellow'],
    ['BREAKOUT_CANDIDATE', 'orange'],
    ['VETERAN', 'red'],
  ] as const)('maps %s to %s', (archetype, grade) => {
    expect(gradeArchetypeFactor(archetype)).toBe(grade);
  });
});

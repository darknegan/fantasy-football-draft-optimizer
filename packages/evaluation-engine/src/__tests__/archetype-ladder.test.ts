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
        }),
      ),
    ).toBe('ELITE');
  });

  it('rule 4: <=6 seasons and at least three top-8 finishes is ELITE', () => {
    expect(
      classify(
        player({
          seasonsInLeague: 6,
          positionalTop5FinishCount: 1,
          positionalTop8FinishCount: 3,
        }),
      ),
    ).toBe('ELITE');
  });

  it('year 5-6 with two top-5 but fewer than three top-8 is IN_THEIR_PRIME', () => {
    expect(
      classify(
        player({
          seasonsInLeague: 5,
          positionalTop5FinishCount: 2,
          positionalTop8FinishCount: 2,
        }),
      ),
    ).toBe('IN_THEIR_PRIME');
  });

  it('rule 5: aging with at least three top-8 finishes is TRUSTY_VETERAN', () => {
    expect(classify(player({ age: 28, seasonsInLeague: 7, positionalTop8FinishCount: 3 }))).toBe(
      'TRUSTY_VETERAN',
    );
    expect(classify(player({ age: 27, seasonsInLeague: 7, positionalTop8FinishCount: 3 }))).toBe(
      'TRUSTY_VETERAN',
    );
  });

  it('rule 6: aging without three top-8 finishes is VETERAN', () => {
    expect(classify(player({ age: 28, seasonsInLeague: 6, positionalTop8FinishCount: 2 }))).toBe(
      'VETERAN',
    );
  });

  it('young breakout takes precedence over the age gate', () => {
    expect(classify(player({ seasonsInLeague: 2, age: 28 }))).toBe('BREAKOUT_CANDIDATE');
  });
});

describe('QB ladder', () => {
  const qb = (overrides: Partial<Player>) => p({ position: 'QB', ...overrides });

  it('uses age 34 for a pedigreed TRUSTY_VETERAN', () => {
    expect(classifyQb(qb({ age: 34, seasonsInLeague: 10, positionalTop8FinishCount: 3 }))).toBe(
      'TRUSTY_VETERAN',
    );
  });

  it('uses age 34 for a VETERAN without pedigree', () => {
    expect(classifyQb(qb({ age: 34, seasonsInLeague: 10, positionalTop8FinishCount: 2 }))).toBe(
      'VETERAN',
    );
  });

  it('does not use year 7 as a QB veteran gate', () => {
    expect(classifyQb(qb({ age: 32, seasonsInLeague: 10, positionalTop8FinishCount: 2 }))).toBe(
      'IN_THEIR_PRIME',
    );
  });

  it('applies rules 1-4 before the age gate', () => {
    expect(
      classifyQb(
        qb({
          age: 34,
          seasonsInLeague: 3,
          positionalTop5FinishCount: 2,
          positionalTop8FinishCount: 2,
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
    });
    const lowVolume = evaluateArchetype(wr, [{ factorId: 'targets', value: 1 }]);
    const highVolume = evaluateArchetype(wr, [{ factorId: 'targets', value: 20 }]);

    expect(lowVolume.rates).toEqual(highVolume.rates);
    expect(lowVolume.rates.boomRate).toBe(0.338);
  });

  it('makes VETERAN rates provisional relative to TRUSTY_VETERAN', () => {
    const trusty = evaluateArchetype(
      p({ age: 28, seasonsInLeague: 7, positionalTop8FinishCount: 3, position: 'WR' }),
    );
    const veteran = evaluateArchetype(p({ age: 28, positionalTop8FinishCount: 2, position: 'WR' }));

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

import type { Player, Position } from '@draftlab/domain';
import { describe, expect, it } from 'vitest';
import { classifyArchetype, explainArchetype } from '../archetype.js';

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

describe('explainArchetype', () => {
  it('explains elite via top-8 half-rate', () => {
    const text = explainArchetype(
      p({ position: 'QB', seasonsInLeague: 8, positionalTop8FinishCount: 7, positionalTop12FinishCount: 7 }),
    );
    expect(text.toLowerCase()).toMatch(/top-8|rule 4|over half/);
  });

  it('matches classifyArchetype for each ladder branch', () => {
    const cases: Partial<Player>[] = [
      { seasonsInLeague: 2, age: 23 },
      { seasonsInLeague: 3, positionalTop5FinishCount: 1 },
      {
        seasonsInLeague: 4,
        positionalTop5FinishCount: 2,
        positionalTop8FinishCount: 2,
        positionalTop12FinishCount: 2,
      },
      {
        seasonsInLeague: 6,
        positionalTop5FinishCount: 1,
        positionalTop8FinishCount: 4,
        positionalTop12FinishCount: 4,
      },
      {
        age: 28,
        seasonsInLeague: 7,
        positionalTop8FinishCount: 3,
        positionalTop12FinishCount: 4,
      },
      {
        age: 28,
        seasonsInLeague: 6,
        positionalTop8FinishCount: 2,
        positionalTop12FinishCount: 2,
      },
      {
        seasonsInLeague: 5,
        positionalTop5FinishCount: 2,
        positionalTop8FinishCount: 2,
        positionalTop12FinishCount: 2,
      },
    ];

    for (const overrides of cases) {
      const player = p({ position: 'WR', ...overrides });
      expect(explainArchetype(player).length).toBeGreaterThan(0);
      expect(classifyArchetype(player)).toBeDefined();
    }
  });

  it('includes age for QB veteran gate', () => {
    const text = explainArchetype(
      p({
        position: 'QB',
        age: 34,
        seasonsInLeague: 10,
        positionalTop8FinishCount: 2,
        positionalTop12FinishCount: 3,
      }),
    );
    expect(text.toLowerCase()).toMatch(/age 34|rule 6/);
  });

  it('includes age or year for skill veteran gate', () => {
    const text = explainArchetype(
      p({
        position: 'WR',
        age: 28,
        seasonsInLeague: 6,
        positionalTop8FinishCount: 2,
        positionalTop12FinishCount: 2,
      }),
    );
    expect(text.toLowerCase()).toMatch(/age 28|yr 6|rule 6/);
  });

  it('explains trusty via top-12 half-rate without top-8 half', () => {
    const text = explainArchetype(
      p({
        position: 'RB',
        age: 27,
        seasonsInLeague: 7,
        positionalTop8FinishCount: 3,
        positionalTop12FinishCount: 4,
      }),
    );
    expect(text.toLowerCase()).toMatch(/top-12|rule 5|over half/);
  });
});

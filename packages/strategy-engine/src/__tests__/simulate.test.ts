import { describe, expect, it } from 'vitest';
import { compareStrategies, createRng, simulateStrategy, type SimPlayer } from '../simulate.js';
import { buildCheatSheet } from '../tiers.js';

const pool: SimPlayer[] = [
  { id: 'p1', name: 'WR1', position: 'WR', adpOverall: 1, draftScore: 85 },
  { id: 'p2', name: 'RB1', position: 'RB', adpOverall: 2, draftScore: 82 },
  { id: 'p3', name: 'WR2', position: 'WR', adpOverall: 3, draftScore: 80 },
  { id: 'p4', name: 'RB2', position: 'RB', adpOverall: 4, draftScore: 78 },
  { id: 'p5', name: 'TE1', position: 'TE', adpOverall: 18, draftScore: 72 },
  { id: 'p6', name: 'QB1', position: 'QB', adpOverall: 30, draftScore: 70 },
  { id: 'p7', name: 'WR3', position: 'WR', adpOverall: 8, draftScore: 74 },
  { id: 'p8', name: 'RB3', position: 'RB', adpOverall: 9, draftScore: 73 },
  { id: 'p9', name: 'WR4', position: 'WR', adpOverall: 12, draftScore: 68 },
  { id: 'p10', name: 'RB4', position: 'RB', adpOverall: 14, draftScore: 66 },
  { id: 'p11', name: 'TE2', position: 'TE', adpOverall: 40, draftScore: 55 },
  { id: 'p12', name: 'QB2', position: 'QB', adpOverall: 45, draftScore: 52 },
];

describe('simulateStrategy', () => {
  it('is deterministic for a fixed seed', () => {
    const a = simulateStrategy({
      strategyId: 'balanced',
      slot: 3,
      teamCount: 12,
      rounds: 6,
      iterations: 50,
      seed: 7,
      players: pool,
    });
    const b = simulateStrategy({
      strategyId: 'balanced',
      slot: 3,
      teamCount: 12,
      rounds: 6,
      iterations: 50,
      seed: 7,
      players: pool,
    });
    expect(a.meanRosterScore).toBe(b.meanRosterScore);
    expect(a.assumptions.note.length).toBeGreaterThan(20);
    expect(a.bustRate).toBeGreaterThanOrEqual(0);
    expect(a.scoreHistogram.length).toBeGreaterThan(0);
    expect(a.commonRoster.length).toBeGreaterThan(0);
    expect(a.scoreHistogram.reduce((s, b) => s + b.rate, 0)).toBeGreaterThan(0.9);
  });

  it('Elite TE takes more TEs early than Balanced on average', () => {
    const balanced = simulateStrategy({
      strategyId: 'balanced',
      slot: 2,
      teamCount: 12,
      rounds: 6,
      iterations: 80,
      seed: 11,
      players: pool,
    });
    const eliteTe = simulateStrategy({
      strategyId: 'elite_te',
      slot: 2,
      teamCount: 12,
      rounds: 6,
      iterations: 80,
      seed: 11,
      players: pool,
    });
    expect(eliteTe.positionMix.TE).toBeGreaterThanOrEqual(balanced.positionMix.TE);
  });
});

describe('compareStrategies', () => {
  it('ranks strategies by mean roster score', () => {
    const cmp = compareStrategies({
      strategyIds: ['balanced', 'zero_rb', 'robust_rb'],
      slot: 3,
      teamCount: 12,
      rounds: 6,
      iterations: 40,
      seed: 3,
      players: pool,
    });
    expect(cmp.ranking).toHaveLength(3);
    expect(cmp.ranking[0]!.rank).toBe(1);
    expect(cmp.ranking[0]!.meanRosterScore).toBeGreaterThanOrEqual(cmp.ranking[2]!.meanRosterScore);
  });
});

describe('createRng', () => {
  it('stays in [0,1)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 20; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('buildCheatSheet', () => {
  it('groups players into positional tiers', () => {
    const sheet = buildCheatSheet(
      pool.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        draftScore: p.draftScore,
        ceilingScore: null,
        provisional: p.position === 'RB',
        ceilingKnownFactors: 5,
        adpRoundPick: '1.01',
      })),
    );
    expect(sheet.find((g) => g.position === 'WR')?.tiers.length).toBeGreaterThan(0);
    expect(
      sheet.every((g) => g.tiers.every((t) => t.players.every((p) => p.position === g.position))),
    ).toBe(true);
  });

  it('excludes zero-known-factor players from tiers and lists them as unranked instead', () => {
    const sheet = buildCheatSheet(
      pool.map((p, i) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        // First WR in the pool has a wildly inflated score from mostly-generic defaults
        // (no real measured production) — must not stretch the tier range for the rest.
        draftScore: p.position === 'WR' && i === 0 ? 999 : p.draftScore,
        ceilingScore: p.position === 'WR' && i === 0 ? null : 10,
        provisional: false,
        ceilingKnownFactors: p.position === 'WR' && i === 0 ? 0 : 5,
        adpRoundPick: '1.01',
      })),
    );
    const wrGroup = sheet.find((g) => g.position === 'WR')!;
    expect(wrGroup.unranked).toHaveLength(1);
    expect(wrGroup.unranked[0]!.draftScore).toBe(999);
    expect(wrGroup.tiers.every((t) => t.players.every((p) => p.ceilingKnownFactors > 0))).toBe(
      true,
    );
  });
});

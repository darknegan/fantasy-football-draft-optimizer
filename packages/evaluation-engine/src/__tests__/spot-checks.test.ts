import { describe, expect, it } from 'vitest';
import type { FactorGrade, FactorInput, Player } from '@draftlab/domain';
import { GRADE_WEIGHTS, DEFAULT_GRADING_BANDS } from '../config/grade-weights.js';
import { computeCeilingScore } from '../ceiling.js';
import { gradeByRatio } from '../grade-factor.js';
import { evaluateArchetype, classifyWr, computeArchetypeEv } from '../archetype.js';

/** Sum CeilingScore from a grade list — mirrors the spreadsheet legend. */
function ceilingFromGrades(grades: FactorGrade[]): number {
  return grades.reduce((sum, g) => sum + GRADE_WEIGHTS[g], 0);
}

describe('factor grade weights (spreadsheet legend)', () => {
  it('uses green +5, yellow +3, orange −1, red −3', () => {
    expect(GRADE_WEIGHTS.green).toBe(5);
    expect(GRADE_WEIGHTS.yellow).toBe(3);
    expect(GRADE_WEIGHTS.orange).toBe(-1);
    expect(GRADE_WEIGHTS.red).toBe(-3);
    expect(GRADE_WEIGHTS.unknown).toBe(0);
  });
});

describe('spot-check CeilingScores from source spreadsheets', () => {
  it('Josh Allen (QB1) → 41 — 7 green, 3 yellow, 0 orange, 1 red (+ unknown)', () => {
    // 7+3+1 = 11 known; twelfth factor unknown (0) keeps total at 41.
    const allen: FactorGrade[] = [
      ...Array(7).fill('green'),
      ...Array(3).fill('yellow'),
      'red',
      'unknown',
    ] as FactorGrade[];
    expect(allen).toHaveLength(12);
    expect(7 * 5 + 3 * 3 + 0 + -3 + 0).toBe(41);
    expect(ceilingFromGrades(allen)).toBe(41);
  });

  it("Ja'Marr Chase (WR1) → 42 — 9 green, 1 yellow, 0 orange, 2 red", () => {
    const chase: FactorGrade[] = [
      ...Array(9).fill('green'),
      'yellow',
      'red',
      'red',
    ] as FactorGrade[];
    expect(chase).toHaveLength(12);
    expect(9 * 5 + 1 * 3 + 2 * -3).toBe(42);
    expect(ceilingFromGrades(chase)).toBe(42);
  });

  it('Brock Bowers (TE1) → 36 — 8 green, 1 yellow, 1 orange, 2 red', () => {
    const bowers: FactorGrade[] = [
      ...Array(8).fill('green'),
      'yellow',
      'orange',
      'red',
      'red',
    ] as FactorGrade[];
    expect(bowers).toHaveLength(12);
    expect(8 * 5 + 1 * 3 + 1 * -1 + 2 * -3).toBe(36);
    expect(ceilingFromGrades(bowers)).toBe(36);
  });
});

describe('computeCeilingScore with engineered factor values', () => {
  it('sums graded weights for a full QB profile totaling 41', () => {
    const inputs: FactorInput[] = [
      { factorId: 'pass_attempts', value: null },
      { factorId: 'passing_tds', value: 2.63 * 0.7 },
      { factorId: 'rush_attempts', value: 5.74 * 1.1 },
      { factorId: 'rushing_tds', value: 0.32 * 1.1 },
      { factorId: 'off_ppg_rank', value: 6.35 / 1.1 },
      { factorId: 'ol_pass_block_rank', value: 11.54 / 1.1 },
      { factorId: 'deep_ball_attempts', value: 4.31 * 1.1 },
      { factorId: 'qbr_rank', value: 6.9 / 1.1 },
      { factorId: 'red_zone_attempts', value: 6.3 * 1.1 },
      { factorId: 'adp', value: 8.22 / 0.95 },
      { factorId: 'neutral_pace_rank', value: 12.86 / 0.95 },
      { factorId: 'pass_dvoa_rank', value: 7.01 / 0.95 },
    ];

    const result = computeCeilingScore('QB', inputs);
    expect(result.provisional).toBe(false);
    expect(result.ceilingScore).toBe(41);
    expect(result.knownFactors).toBe(11);
  });

  it('returns provisional null CeilingScore for RB', () => {
    const result = computeCeilingScore('RB', []);
    expect(result.provisional).toBe(true);
    expect(result.ceilingScore).toBeNull();
    expect(result.confidenceScore).toBe(0);
  });
});

describe('ratio grading bands', () => {
  it('grades Josh Allen rush attempts green vs benchmark', () => {
    expect(gradeByRatio(6.59, 5.74, 'higherBetter', DEFAULT_GRADING_BANDS)).toBe('green');
  });

  it('grades Allen pass attempts orange (below bar)', () => {
    expect(gradeByRatio(27.1, 33.91, 'higherBetter', DEFAULT_GRADING_BANDS)).toBe('orange');
  });
});

describe('archetype classification', () => {
  it('classifies a clear young WR1 as Prime WR1 with high EV', () => {
    const chase: Player = {
      id: 'chase',
      externalIds: {},
      name: "Ja'Marr Chase",
      team: 'CIN',
      position: 'WR',
      age: 25,
      seasonsInLeague: 5,
      draftYear: 2021,
      draftRound: 1,
      status: 'active',
      hasPositionalTop12Finish: true,
      isClearWr1: true,
    };
    expect(classifyWr(chase)).toBe('PRIME_WR1');
    const ev = evaluateArchetype(chase);
    expect(ev.archetypeEv).toBeCloseTo(computeArchetypeEv(ev.rates), 5);
    expect(ev.archetypeEv).toBeGreaterThan(0.8);
  });
});

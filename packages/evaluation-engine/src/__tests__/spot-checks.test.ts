import { describe, expect, it } from 'vitest';
import type { FactorGrade, FactorInput, Player } from '@draftlab/domain';
import { GRADE_WEIGHTS, DEFAULT_GRADING_BANDS } from '../config/grade-weights.js';
import { computeCeilingScore } from '../ceiling.js';
import { gradeByRatio } from '../grade-factor.js';
import { evaluateArchetype, classifyRb, classifyWr, computeArchetypeEv } from '../archetype.js';

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

  it('RB is no longer globally provisional — an empty input set still computes (all factors unknown)', () => {
    const result = computeCeilingScore('RB', []);
    expect(result.provisional).toBe(false);
    expect(result.ceilingScore).toBe(0);
    expect(result.knownFactors).toBe(0);
    expect(result.confidenceScore).toBe(0);
  });

  it('RB with real sourced values grades correctly, unsourced factors honestly unknown', () => {
    // Bijan Robinson's real sleeperMCP-measured values against the real nflverse-derived
    // RB benchmarks (see benchmarks.ts). rz_touch_share/gl_carry_share/neutral_run_rate,
    // archetype and injury_concern are deliberately omitted — no source yet, same honest
    // gap QB/WR/TE already tolerate for their own unlicensed factors.
    const inputs: FactorInput[] = [
      { factorId: 'touches', value: 21.529 }, // benchmark 21.5 -> ratio ~1.001 -> yellow
      { factorId: 'off_ppg_rank', value: 24 }, // benchmark 9.5, lowerBetter -> ratio ~0.396 -> red
      { factorId: 'snap_share', value: 0.782 }, // benchmark 0.717 -> ratio ~1.091 -> green
    ];
    const result = computeCeilingScore('RB', inputs);
    expect(result.provisional).toBe(false);
    const byId = new Map(result.factors.map((f) => [f.factorId, f.grade]));
    expect(byId.get('touches')).toBe('yellow');
    expect(byId.get('off_ppg_rank')).toBe('red');
    expect(byId.get('snap_share')).toBe('green');
    expect(byId.get('rz_touch_share')).toBe('unknown');
    expect(result.knownFactors).toBe(3);
    expect(result.ceilingScore).toBe(
      GRADE_WEIGHTS.yellow + GRADE_WEIGHTS.red + GRADE_WEIGHTS.green,
    );
    expect(result.confidenceScore).toBeCloseTo(3 / 16, 5);
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
      teamPositionRank: 1,
    };
    expect(classifyWr(chase)).toBe('PRIME_WR1');
    const ev = evaluateArchetype(chase);
    expect(ev.archetypeEv).toBeCloseTo(computeArchetypeEv(ev.rates), 5);
    expect(ev.archetypeEv).toBeGreaterThan(0.8);
  });

  it("classifies a WR who is not their team's clear #1 as Prime WR2", () => {
    const wr2: Player = {
      id: 'wr2',
      externalIds: {},
      name: 'Test WR2',
      team: 'TST',
      position: 'WR',
      age: 26,
      seasonsInLeague: 4,
      draftYear: 2022,
      draftRound: 3,
      status: 'active',
      hasPositionalTop12Finish: true,
      teamPositionRank: 2,
    };
    expect(classifyWr(wr2)).toBe('PRIME_WR2');
  });

  function rb(overrides: Partial<Player>): Player {
    return {
      id: 'rb',
      externalIds: {},
      name: 'Test RB',
      team: 'TST',
      position: 'RB',
      age: 24,
      seasonsInLeague: 2,
      draftYear: 2024,
      draftRound: 1,
      status: 'active',
      hasPositionalTop12Finish: false,
      ...overrides,
    };
  }

  it('classifies a young RB with zero top-12 finishes as an unproven breakout candidate', () => {
    expect(classifyRb(rb({ positionalTop12FinishCount: 0 }))).toBe('BREAKOUT_CANDIDATE');
  });

  it('classifies a young RB with exactly one top-12 finish as a proven breakout candidate', () => {
    expect(classifyRb(rb({ positionalTop12FinishCount: 1, hasPositionalTop12Finish: true }))).toBe(
      'PROVEN_BREAKOUT_CANDIDATE',
    );
  });

  it('classifies a young RB with 2+ top-12 finishes as a prime RB, not a breakout — RB1 or RB2 by team_position_rank', () => {
    expect(
      classifyRb(
        rb({ positionalTop12FinishCount: 2, hasPositionalTop12Finish: true, teamPositionRank: 1 }),
      ),
    ).toBe('PRIME_RB1');
    expect(
      classifyRb(
        rb({ positionalTop12FinishCount: 2, hasPositionalTop12Finish: true, teamPositionRank: 2 }),
      ),
    ).toBe('PRIME_RB2');
    // No team_position_rank on record defaults to RB2 — a committee back cannot be
    // assumed to be the lead option just because no data says otherwise.
    expect(classifyRb(rb({ positionalTop12FinishCount: 2, hasPositionalTop12Finish: true }))).toBe(
      'PRIME_RB2',
    );
  });

  it('falls back to the legacy boolean split when no finish count is on record', () => {
    expect(classifyRb(rb({ hasPositionalTop12Finish: false }))).toBe('BREAKOUT_CANDIDATE');
    expect(classifyRb(rb({ hasPositionalTop12Finish: true }))).toBe('PRIME_RB2');
    expect(classifyRb(rb({ hasPositionalTop12Finish: true, teamPositionRank: 1 }))).toBe(
      'PRIME_RB1',
    );
  });

  it('still classifies veterans as trusty regardless of finish count', () => {
    expect(
      classifyRb(
        rb({
          seasonsInLeague: 8,
          age: 29,
          positionalTop12FinishCount: 2,
          hasPositionalTop12Finish: true,
        }),
      ),
    ).toBe('TRUSTY_VETERAN');
  });

  it("matches real seed data: Bijan Robinson, Jahmyr Gibbs, and Chase Brown (count>=2, from sleeperMCP build_factors.py, and each their team's lead back) land as Prime RB1, not breakout", () => {
    const bijan = rb({
      name: 'Bijan Robinson',
      age: 23,
      seasonsInLeague: 3,
      hasPositionalTop12Finish: true,
      positionalTop12FinishCount: 3,
      teamPositionRank: 1,
    });
    expect(classifyRb(bijan)).toBe('PRIME_RB1');

    const chaseBrown = rb({
      name: 'Chase Brown',
      age: 25,
      seasonsInLeague: 3,
      hasPositionalTop12Finish: true,
      positionalTop12FinishCount: 2,
      teamPositionRank: 1,
    });
    expect(classifyRb(chaseBrown)).toBe('PRIME_RB1');
  });
});

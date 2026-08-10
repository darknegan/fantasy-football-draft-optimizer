import { describe, expect, it } from 'vitest';
import type {
  ArchetypeResult,
  FactorGrade,
  FactorInput,
  Player,
  RiskResult,
} from '@draftlab/domain';
import { GRADE_WEIGHTS, DEFAULT_GRADING_BANDS } from '../config/grade-weights.js';
import { computeCeilingScore } from '../ceiling.js';
import { computeDraftScore } from '../draft-score.js';
import { gradeByRatio } from '../grade-factor.js';
import { evaluateArchetype, classifyRb, classifyWr, computeArchetypeEv } from '../archetype.js';
import { evaluateValue } from '../value.js';

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
      { factorId: 'deep_ball_attempts', value: 4.397 * 1.1 },
      { factorId: 'qbr_rank', value: 6.9 / 1.1 },
      { factorId: 'red_zone_attempts', value: 6.848 * 1.1 },
      { factorId: 'adp', value: 8.22 / 0.95 },
      { factorId: 'neutral_pace_rank', value: 12.697 / 0.95 },
      { factorId: 'pass_dvoa_rank', value: 7.01 / 0.95 },
    ];

    const result = computeCeilingScore('QB', inputs);
    expect(result.provisional).toBe(false);
    expect(result.ceilingScore).toBe(41);
    expect(result.knownFactors).toBe(11);
  });

  it('RB is no longer globally provisional; zero known factors sums to a literal 0, not null', () => {
    // Deliberately 0, not null. null would trip computeDraftScore's ceiling-weight
    // redistribution — built for RB's old position-wide provisional gate, where NOBODY at
    // the position had data, so shifting weight onto archetype+risk was fair. It backfires
    // for one individual zero-data player among otherwise-graded peers: archetype/risk are
    // themselves uniform/neutral defaults for everyone right now (see archetype.ts/risk.ts),
    // so redistributing MORE weight onto them made a zero-data player score even higher than
    // before — confirmed live via Fernando Mendoza's draftScore jumping from 61.9 to 72.4
    // when this was tried. The actual fix lives in tiers.ts: buildCheatSheet excludes
    // zero-known-factor players from the S-D percentile ranking entirely, rather than trying
    // to make draftScore itself "fair" for a player we've measured nothing about.
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

  it('draftScore alone still separates zero-data from a real bad grade (the robust fix is in buildCheatSheet, though — see tiers.test)', () => {
    // With ceiling counted normally at full weight (a literal 0, not redistributed), a
    // zero-data player's neutral-ish 0 still beats a real, harshly-graded negative score —
    // just not by as wide a margin as the broken redistribution version did. That gap isn't
    // "fixed" at this layer and isn't meant to be: buildCheatSheet excludes zero-known-factor
    // players from ranked tiers entirely, which is the actual fix for cheat-sheet placement.
    // This test just confirms the raw arithmetic didn't regress in the other direction.
    const neutralArchetype: ArchetypeResult = {
      archetype: 'IN_THEIR_PRIME',
      rates: { returnRate: 0.4, injuryRate: 0.15, boomRate: 0.22, bustRate: 0.2, fineRate: 0.23 },
      archetypeEv: 0.415,
    };
    const neutralRisk: RiskResult = {
      riskProfile: 7.75,
      expectedGamesMissed: 1.7,
      components: {
        careerMissedRate: 0.1,
        archetypeInjury: 0.15,
        ageCurvePenalty: 0,
        recentSeriousInjury: 0,
      },
    };
    const neutralValue = evaluateValue({ adpRoundPick: '10.01', teamCount: 12 });

    const noData = computeCeilingScore('QB', []);
    const realBadSeason = computeCeilingScore('QB', [
      { factorId: 'pass_attempts', value: 23.2 },
      { factorId: 'passing_tds', value: 1.6 },
      { factorId: 'rush_attempts', value: 5.2 },
      { factorId: 'rushing_tds', value: 0.15 },
      { factorId: 'off_ppg_rank', value: 11 },
    ]);
    expect(realBadSeason.ceilingScore).not.toBeNull();
    expect(realBadSeason.ceilingScore!).toBeLessThan(0);

    const noDataScore = computeDraftScore(
      noData,
      neutralArchetype,
      neutralRisk,
      neutralValue,
      'QB',
    );
    const realBadScore = computeDraftScore(
      realBadSeason,
      neutralArchetype,
      neutralRisk,
      neutralValue,
      'QB',
    );
    expect(realBadScore).toBeLessThan(noDataScore);
  });
});

describe('evaluateValue', () => {
  it('computes full-confidence value from a licensed rank', () => {
    const result = evaluateValue({ fseRank: 5, adpRoundPick: '2.01', teamCount: 12 });
    expect(result.usedMechanicalFallback).toBe(false);
    // adpOverallPick 13, fseRank 5 -> (13-5)*1.5 = 12
    expect(result.valueScore).toBe(12);
  });

  it('dampens value to 0.3 confidence when computed from the mechanical projectedRank fallback', () => {
    const withFallback = evaluateValue({ projectedRank: 5, adpRoundPick: '2.01', teamCount: 12 });
    expect(withFallback.usedMechanicalFallback).toBe(true);
    // Same gap as the licensed-rank case above (12), but at 0.3 confidence.
    expect(withFallback.valueScore).toBe(3.6);
  });

  it("dampens a Travis Kelce-style false bargain (real ADP correctly discounts age/decline; the mechanical rank doesn't know that)", () => {
    // adpOverallPick 134 (12.02), projectedRank 81 raw stats rank -> full-strength gap would
    // be (134-81)*1.5 = 79.5, clamped nowhere near the 100 cap. Dampened to a more honest ~23.85.
    const result = evaluateValue({ projectedRank: 81, adpRoundPick: '12.02', teamCount: 12 });
    expect(result.usedMechanicalFallback).toBe(true);
    expect(result.valueScore).toBe(23.8);
  });

  it('does not dampen when a licensed rank is present even if projectedRank also is', () => {
    const result = evaluateValue({
      fseRank: 5,
      projectedRank: 81,
      adpRoundPick: '2.01',
      teamCount: 12,
    });
    expect(result.usedMechanicalFallback).toBe(false);
    expect(result.valueScore).toBe(12);
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

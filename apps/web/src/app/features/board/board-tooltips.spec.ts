import { describe, expect, it } from 'vitest';
import type { BoardPlayer, FactorGrade, Position } from '../../core/api.types';
import {
  BOARD_HEADER_PURPOSE,
  buildArchetypeTooltip,
  buildCeilingTooltip,
  buildScoreTooltip,
  explainBoardArchetype,
} from './board-tooltips';

function fakeRow(overrides: {
  position?: Position;
  draftScore?: number;
  contextualScore?: number;
  weights?: { ceiling: number; archetype: number; value: number; risk: number };
  ceilingScore?: number | null;
  knownFactors?: number;
  factors?: Array<{ label: string; grade: FactorGrade; weight: number }>;
  archetype?: string;
  archetypeEv?: number;
  rates?: {
    boomRate: number;
    bustRate: number;
    injuryRate: number;
    returnRate: number;
    fineRate: number;
  };
  valueScore?: number;
  riskProfile?: number;
  age?: number;
  seasonsInLeague?: number;
  top5?: number;
  top8?: number;
  top12?: number;
}): BoardPlayer {
  return {
    player: {
      id: 'p1',
      name: 'Test',
      team: 'TST',
      position: overrides.position ?? 'WR',
      age: overrides.age ?? 25,
      seasonsInLeague: overrides.seasonsInLeague ?? 5,
      status: 'active',
      positionalTop5FinishCount: overrides.top5 ?? 0,
      positionalTop8FinishCount: overrides.top8 ?? 5,
      positionalTop12FinishCount: overrides.top12 ?? 5,
    },
    evaluation: {
      playerId: 'p1',
      draftScore: overrides.draftScore ?? 76,
      weights: overrides.weights ?? {
        ceiling: 0.4,
        archetype: 0.25,
        value: 0.2,
        risk: 0.15,
      },
      ceiling: {
        ceilingScore: overrides.ceilingScore === undefined ? 35 : overrides.ceilingScore,
        knownFactors: overrides.knownFactors ?? 15,
        confidenceScore: 0.8,
        provisional: false,
        factors: overrides.factors ?? [
          { factorId: 'targets', label: 'targets', value: 10, grade: 'elite', weight: 5 },
          { factorId: 'rec', label: 'receptions', value: 8, grade: 'elite', weight: 5 },
          { factorId: 'routes', label: 'route participation', value: 1, grade: 'green', weight: 3 },
          { factorId: 'yprr', label: 'yprr', value: null, grade: 'unknown', weight: 0 },
          ...Array.from({ length: 13 }, (_, i) => ({
            factorId: `pad${i}`,
            label: `pad ${i}`,
            value: 1,
            grade: 'yellow' as FactorGrade,
            weight: 1,
          })),
        ],
      },
      archetype: {
        archetype: overrides.archetype ?? 'ELITE',
        archetypeEv: overrides.archetypeEv ?? 0.82,
        rates: overrides.rates ?? {
          boomRate: 0.34,
          bustRate: 0.13,
          injuryRate: 0.11,
          returnRate: 0.54,
          fineRate: 0.23,
        },
      },
      risk: { riskProfile: overrides.riskProfile ?? 20, expectedGamesMissed: 2 },
      value: {
        valueScore: overrides.valueScore ?? 10,
        adpRoundPick: '1.08',
        blendedRank: 8,
      },
    },
    recommendation:
      overrides.contextualScore != null ? { contextualScore: overrides.contextualScore } : undefined,
    drafted: false,
  } as BoardPlayer;
}

describe('buildScoreTooltip', () => {
  it('score tooltip lists four weighted parts', () => {
    const text = buildScoreTooltip(fakeRow({}));
    expect(text).toMatch(/Ceiling/);
    expect(text).toMatch(/0\.40|40%/);
    expect(text).toMatch(/Archetype/);
    expect(text).toMatch(/Value/);
    expect(text).toMatch(/Risk/);
  });

  it('notes contextual when contextualScore differs from draftScore', () => {
    const text = buildScoreTooltip(fakeRow({ draftScore: 70, contextualScore: 76 }));
    expect(text.toLowerCase()).toMatch(/contextual/);
    expect(text).toMatch(/76/);
  });

  it('uses default 0.40 ceiling weight when evaluation.weights is missing', () => {
    const row = fakeRow({});
    delete row.evaluation.weights;
    const text = buildScoreTooltip(row);
    expect(text).toMatch(/0\.40|40%/);
  });
});

describe('buildCeilingTooltip', () => {
  it('shows raw total, known/configured, and top graded contributors', () => {
    const text = buildCeilingTooltip(fakeRow({}), false);
    expect(text).toMatch(/Ceiling 35/);
    expect(text).toMatch(/15\/17/);
    expect(text).toMatch(/\+5 targets \(elite\)/);
    expect(text).toMatch(/route participation \(green\)/);
    expect(text).toMatch(/unknown × 1 omitted from sum/);
    expect(text).not.toMatch(/yprr/);
  });

  it('adds a top-5 line when the player is in the position set', () => {
    const text = buildCeilingTooltip(fakeRow({ position: 'WR' }), true);
    expect(text).toMatch(/Top 5 WR ceiling/);
  });
});

describe('buildArchetypeTooltip', () => {
  it('shows label, EV, why, and rates', () => {
    const row = fakeRow({});
    const why = explainBoardArchetype(row);
    const text = buildArchetypeTooltip(row, why);
    expect(text).toMatch(/Elite/);
    expect(text).toMatch(/EV 0\.82/);
    expect(text).toMatch(/Why:/);
    expect(text).toMatch(/Boom 34%/);
    expect(text).toMatch(/Bust 13%/);
    expect(text).toMatch(/Injury 11%/);
    expect(text).toMatch(/Return 54%/);
    expect(text).toMatch(/Fine 23%/);
  });
});

describe('explainBoardArchetype', () => {
  it('explains elite via top-8 half-rate', () => {
    const text = explainBoardArchetype(
      fakeRow({
        position: 'WR',
        seasonsInLeague: 5,
        top5: 0,
        top8: 5,
        top12: 5,
      }),
    );
    expect(text.toLowerCase()).toMatch(/top-8|rule 4|over half/);
  });
});

describe('BOARD_HEADER_PURPOSE', () => {
  it('has a purpose blurb for every labeled board column', () => {
    const keys = [
      '#',
      'POS',
      'PLAYER',
      'ADP',
      'SCORE',
      'CEILING',
      'CONF',
      'ARCHETYPE',
      'RISK',
      'VALUE',
      'PROJ',
      'FACTORS',
    ];
    for (const key of keys) {
      expect(BOARD_HEADER_PURPOSE[key]?.length).toBeGreaterThan(10);
    }
  });
});

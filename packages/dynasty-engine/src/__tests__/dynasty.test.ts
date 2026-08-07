import { describe, expect, it } from 'vitest';
import type { Player, PlayerEvaluation } from '@draftlab/domain';
import {
  applyDynastyModeToRecommendations,
  buildMultiYearCurve,
  buildRosterAgeCurve,
  buildRookieBoard,
  dynastyCompositeScore,
  estimatePickValue,
  mapTradedPicks,
  seedPickAssets,
} from '../index.js';

function fakeEval(overrides: Partial<PlayerEvaluation> = {}): PlayerEvaluation {
  return {
    playerId: 'p',
    ceiling: {
      ceilingScore: 30,
      factors: [],
      knownFactors: 12,
      confidenceScore: 1,
      provisional: false,
    },
    archetype: {
      archetype: 'BREAKOUT_CANDIDATE',
      rates: { returnRate: 0.7, injuryRate: 0.2, boomRate: 0.25, bustRate: 0.3, fineRate: 0.45 },
      archetypeEv: 0.4,
    },
    risk: {
      riskProfile: 35,
      expectedGamesMissed: 2,
      components: {
        careerMissedRate: 0.1,
        archetypeInjury: 0.2,
        ageCurvePenalty: 0,
        recentSeriousInjury: 0,
      },
    },
    value: {
      valueScore: 10,
      adpOverallPick: 24,
      blendedRank: 20,
      fseRank: 18,
      espnProjectionRank: 22,
      adpRoundPick: '2.01',
    },
    draftScore: 72,
    weights: { ceiling: 0.4, archetype: 0.25, value: 0.2, risk: 0.15 },
    ...overrides,
  };
}

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name' | 'age' | 'position'>): Player {
  return {
    externalIds: {},
    team: 'FA',
    seasonsInLeague: 2,
    draftYear: 2023,
    draftRound: 2,
    status: 'active',
    hasPositionalTop12Finish: false,
    ...partial,
  };
}

describe('multi-year curves', () => {
  it('values a young breakout higher in out-years than a trusty veteran', () => {
    const young = player({ id: 'y', name: 'Young WR', age: 23, position: 'WR' });
    const vet = player({
      id: 'v',
      name: 'Vet WR',
      age: 30,
      position: 'WR',
    });
    const youngCurve = buildMultiYearCurve(
      young,
      fakeEval({
        playerId: 'y',
        archetype: {
          archetype: 'BREAKOUT_CANDIDATE',
          rates: { returnRate: 0.7, injuryRate: 0.2, boomRate: 0.25, bustRate: 0.3, fineRate: 0.45 },
          archetypeEv: 0.4,
        },
      }),
      2025,
    );
    const vetCurve = buildMultiYearCurve(
      vet,
      fakeEval({
        playerId: 'v',
        archetype: {
          archetype: 'TRUSTY_VETERAN',
          rates: { returnRate: 0.6, injuryRate: 0.3, boomRate: 0.08, bustRate: 0.25, fineRate: 0.4 },
          archetypeEv: -0.1,
        },
      }),
      2025,
    );
    expect(youngCurve.npv).toBeGreaterThan(vetCurve.npv);
    expect(youngCurve.points[3]!.value).toBeGreaterThan(vetCurve.points[3]!.value);
  });

  it('rebuild mode lifts high-NPV assets relative to contend', () => {
    // Same current score; high NPV should close more of the gap in rebuild.
    const lowNpvContend = dynastyCompositeScore(80, 120, 'contend');
    const highNpvContend = dynastyCompositeScore(80, 280, 'contend');
    const lowNpvRebuild = dynastyCompositeScore(80, 120, 'rebuild');
    const highNpvRebuild = dynastyCompositeScore(80, 280, 'rebuild');
    const contendGap = highNpvContend - lowNpvContend;
    const rebuildGap = highNpvRebuild - lowNpvRebuild;
    expect(rebuildGap).toBeGreaterThan(contendGap);
  });
});

describe('pick assets', () => {
  it('discounts future picks', () => {
    expect(estimatePickValue(2026, 1, 2025)).toBeGreaterThan(estimatePickValue(2027, 1, 2025));
  });

  it('maps sleeper traded_picks shape', () => {
    const assets = mapTradedPicks(
      [{ season: 2026, round: 1, roster_id: 1, owner_id: 2 }],
      2025,
    );
    expect(assets[0]!.label).toBe('2026 1st');
    expect(assets[0]!.ownerRosterId).toBe('roster-2');
  });

  it('seeds a demo portfolio', () => {
    const assets = seedPickAssets(12, 2025, 'roster-user');
    expect(assets.length).toBeGreaterThan(5);
  });
});

describe('roster age + rookie board', () => {
  it('computes contend vs rebuild tilt from ages', () => {
    const prime = buildRosterAgeCurve([
      player({ id: 'a', name: 'A', age: 26, position: 'WR' }),
      player({ id: 'b', name: 'B', age: 27, position: 'RB' }),
      player({ id: 'c', name: 'C', age: 25, position: 'QB' }),
    ]);
    const young = buildRosterAgeCurve([
      player({ id: 'a', name: 'A', age: 22, position: 'WR' }),
      player({ id: 'b', name: 'B', age: 21, position: 'RB' }),
      player({ id: 'c', name: 'C', age: 23, position: 'QB' }),
    ]);
    expect(prime.contendScore).toBeGreaterThan(young.contendScore);
    expect(young.rebuildScore).toBeGreaterThan(prime.rebuildScore);
  });

  it('filters rookies onto a separate board', () => {
    const board = buildRookieBoard(
      [
        {
          player: player({
            id: 'r',
            name: 'Rookie',
            age: 21,
            position: 'WR',
            seasonsInLeague: 0,
            draftYear: 2025,
            draftRound: 1,
          }),
          evaluation: fakeEval({ playerId: 'r' }),
        },
        {
          player: player({ id: 'v', name: 'Vet', age: 28, position: 'WR', seasonsInLeague: 6 }),
          evaluation: fakeEval({ playerId: 'v' }),
        },
      ],
      2025,
    );
    expect(board).toHaveLength(1);
    expect(board[0]!.playerId).toBe('r');
  });
});

describe('mode application', () => {
  it('re-ranks with rebuild favoring NPV', () => {
    const recs = applyDynastyModeToRecommendations(
      [
        {
          playerId: 'low-npv',
          contextualScore: 90,
          draftScore: 90,
          strategyFit: 1,
          rosterNeed: 1,
          scarcityUrgency: 1,
          reasons: [],
          rank: 1,
        },
        {
          playerId: 'high-npv',
          contextualScore: 70,
          draftScore: 70,
          strategyFit: 1,
          rosterNeed: 1,
          scarcityUrgency: 1,
          reasons: [],
          rank: 2,
        },
      ],
      'rebuild',
      new Map([
        ['low-npv', 100],
        ['high-npv', 280],
      ]),
    );
    expect(recs[0]!.playerId).toBe('high-npv');
  });
});

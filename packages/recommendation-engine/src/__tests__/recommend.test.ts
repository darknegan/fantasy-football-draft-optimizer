import { describe, expect, it } from 'vitest';
import type { Player, PlayerEvaluation, RosterShape } from '@draftlab/domain';
import { recommendPlayers } from '../recommend.js';
import { estimateSurvivalProbability } from '../scarcity.js';

function stubPlayer(id: string, position: Player['position'], name = id): Player {
  return {
    id,
    externalIds: {},
    name,
    team: 'XX',
    position,
    age: 25,
    seasonsInLeague: 4,
    draftYear: 2021,
    draftRound: 1,
    status: 'active',
    positionalTop5FinishCount: 2,
    positionalTop8FinishCount: 3,
  };
}

function stubEval(playerId: string, draftScore: number, failsGate = false): PlayerEvaluation {
  return {
    playerId,
    ceiling: {
      ceilingScore: 30,
      factors: [],
      knownFactors: 12,
      confidenceScore: 1,
      provisional: false,
      failsTargetShareGate: failsGate,
    },
    archetype: {
      archetype: 'IN_THEIR_PRIME',
      rates: { returnRate: 0.4, injuryRate: 0.15, boomRate: 0.22, bustRate: 0.2, fineRate: 0.23 },
      archetypeEv: 0.5,
    },
    risk: {
      riskProfile: 20,
      expectedGamesMissed: 2,
      components: {
        careerMissedRate: 0.1,
        archetypeInjury: 0.15,
        ageCurvePenalty: 0,
        recentSeriousInjury: 0,
      },
    },
    value: {
      valueScore: 10,
      adpOverallPick: 20,
      blendedRank: 15,
      fseRank: 15,
      espnProjectionRank: 18,
      projectedRank: null,
      usedMechanicalFallback: false,
      adpRoundPick: '2.08',
    },
    draftScore,
    weights: { ceiling: 0.4, archetype: 0.25, value: 0.2, risk: 0.15 },
  };
}

const shape: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  bench: 6,
  totalStarters: 7,
};

describe('recommendPlayers', () => {
  it('penalises TE in round 4 vs equal draft scores', () => {
    const te = stubPlayer('te1', 'TE');
    const wr = stubPlayer('wr1', 'WR');
    const recs = recommendPlayers({
      strategyId: 'balanced',
      round: 4,
      picksUntilNext: 11,
      userRoster: [],
      rosterShape: shape,
      teamCount: 12,
      available: [
        { player: te, evaluation: stubEval('te1', 70) },
        { player: wr, evaluation: stubEval('wr1', 70) },
      ],
    });

    expect(recs[0]?.playerId).toBe('wr1');
    const teRec = recs.find((r) => r.playerId === 'te1');
    expect(teRec?.strategyFit).toBe(0.6);
    expect(teRec?.reasons.some((r) => r.code === 'te_round4_dead_zone')).toBe(true);
  });

  it('applies target-share gate penalty', () => {
    const te = stubPlayer('te_gate', 'TE');
    const recs = recommendPlayers({
      strategyId: 'elite_te',
      round: 2,
      picksUntilNext: 5,
      userRoster: [],
      rosterShape: shape,
      teamCount: 12,
      available: [{ player: te, evaluation: stubEval('te_gate', 80, true) }],
    });
    expect(recs[0]?.reasons.some((r) => r.code === 'te_target_share_gate')).toBe(true);
    expect(recs[0]!.contextualScore).toBeLessThan(80 * 1.25);
  });

  it('attaches survivalProbability to recommendations', () => {
    const wr = stubPlayer('wr1', 'WR');
    const recs = recommendPlayers({
      strategyId: 'balanced',
      round: 2,
      picksUntilNext: 1,
      nextUserPickOverall: 16,
      userRoster: [],
      rosterShape: shape,
      teamCount: 12,
      available: [{ player: wr, evaluation: stubEval('wr1', 90) }],
    });
    expect(recs[0]?.survivalProbability).toBeGreaterThan(0);
    expect(recs[0]?.survivalProbability).toBeLessThanOrEqual(0.92);
  });
});

describe('estimateSurvivalProbability', () => {
  it('rates later-ADP players as more likely to survive', () => {
    const early = estimateSurvivalProbability({
      adpOverall: 12,
      nextUserPickOverall: 16,
      picksUntilNext: 1,
    });
    const late = estimateSurvivalProbability({
      adpOverall: 40,
      nextUserPickOverall: 16,
      picksUntilNext: 1,
    });
    expect(late).toBeGreaterThan(early);
  });
});

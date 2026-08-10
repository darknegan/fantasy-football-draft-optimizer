import { describe, expect, it } from 'vitest';
import {
  buildRecVsActual,
  DEFAULT_WEIGHTS,
  followRate,
  proposeCalibration,
  recordOutcome,
} from '../index.js';
import type { PlayerRecommendation } from '@draftlab/domain';

const recs = (ids: string[]): PlayerRecommendation[] =>
  ids.map((id, i) => ({
    playerId: id,
    contextualScore: 100 - i,
    draftScore: 80,
    strategyFit: 1,
    rosterNeed: 1,
    scarcityUrgency: 1,
    formatScarcity: 1,
    survivalProbability: 0.5,
    reasons: [],
    rank: i + 1,
  }));

describe('outcomes', () => {
  it('marks followed when actual matches top rec', () => {
    const o = recordOutcome({
      leagueId: 'L',
      pickNumber: 3,
      actualPlayerId: 'a',
      recommendations: recs(['a', 'b', 'c']),
    });
    expect(o.followed).toBe(true);
    expect(o.actualRankAtPick).toBe(1);
  });

  it('tracks rank when user reaches down', () => {
    const o = recordOutcome({
      leagueId: 'L',
      pickNumber: 3,
      actualPlayerId: 'c',
      recommendations: recs(['a', 'b', 'c']),
    });
    expect(o.followed).toBe(false);
    expect(o.actualRankAtPick).toBe(3);
  });
});

describe('compare + recalibrate', () => {
  it('builds rec vs actual rows', () => {
    const outcomes = [
      recordOutcome({
        leagueId: 'L',
        pickNumber: 1,
        actualPlayerId: 'b',
        recommendations: recs(['a', 'b']),
      }),
    ];
    const rows = buildRecVsActual(outcomes, (id) => id.toUpperCase());
    expect(rows[0]!.recommendedName).toBe('A');
    expect(rows[0]!.actualName).toBe('B');
    expect(rows[0]!.rankDelta).toBe(1);
  });

  it('proposes weight shifts when rank delta is large', () => {
    const outcomes = Array.from({ length: 12 }, (_, i) =>
      recordOutcome({
        leagueId: 'L',
        pickNumber: i + 1,
        actualPlayerId: 'd',
        recommendations: recs(['a', 'b', 'c', 'd']),
      }),
    );
    expect(followRate(outcomes)).toBe(0);
    const proposal = proposeCalibration(outcomes);
    expect(proposal.sampleSize).toBe(12);
    expect(proposal.proposedWeights.ceiling).toBeGreaterThan(DEFAULT_WEIGHTS.ceiling - 0.001);
    expect(proposal.notes.length).toBeGreaterThan(0);
  });
});

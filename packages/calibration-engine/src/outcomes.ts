import type { DraftOutcome, PlayerRecommendation } from '@draftlab/domain';

export function recordOutcome(opts: {
  leagueId: string;
  pickNumber: number;
  actualPlayerId: string;
  recommendations: PlayerRecommendation[];
  id?: string;
  recordedAt?: string;
}): DraftOutcome {
  const top = opts.recommendations[0] ?? null;
  const actualRank =
    opts.recommendations.find((r) => r.playerId === opts.actualPlayerId)?.rank ?? null;
  const followed = Boolean(top && top.playerId === opts.actualPlayerId);

  return {
    id: opts.id ?? `out-${opts.leagueId}-${opts.pickNumber}-${opts.actualPlayerId}`,
    leagueId: opts.leagueId,
    pickNumber: opts.pickNumber,
    recommendedPlayerId: top?.playerId ?? null,
    actualPlayerId: opts.actualPlayerId,
    recommendedRank: top?.rank ?? 1,
    actualRankAtPick: actualRank,
    followed,
    recordedAt: opts.recordedAt ?? new Date().toISOString(),
  };
}

export function followRate(outcomes: DraftOutcome[]): number {
  if (!outcomes.length) return 0;
  return Math.round((outcomes.filter((o) => o.followed).length / outcomes.length) * 1000) / 1000;
}

export function meanRankDelta(outcomes: DraftOutcome[]): number {
  const deltas = outcomes
    .map((o) => (o.actualRankAtPick != null ? o.actualRankAtPick - 1 : null))
    .filter((d): d is number => d != null);
  if (!deltas.length) return 0;
  return Math.round((deltas.reduce((s, d) => s + d, 0) / deltas.length) * 10) / 10;
}

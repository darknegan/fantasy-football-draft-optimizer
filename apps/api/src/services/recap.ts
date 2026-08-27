import type { DraftState, League, Player, PlayerEvaluation, Position } from '@draftlab/domain';
import { emptyPositionCounts } from '@draftlab/domain';
import { picksFromEvents, scoreAdherence } from '@draftlab/strategy-engine';

export interface DraftRecap {
  leagueId: string;
  strategyId: string;
  adherence: ReturnType<typeof scoreAdherence>;
  rosterByPosition: Record<Position, Array<{ id: string; name: string; draftScore: number; pickNumber: number }>>;
  meanDraftScore: number;
  bestValue: { id: string; name: string; valueScore: number; pickNumber: number } | null;
  worstValue: { id: string; name: string; valueScore: number; pickNumber: number } | null;
  weaknesses: string[];
  recommendationLog: Array<{ pickNumber: number; taken: string | null; note: string }>;
}

export function buildRecap(opts: {
  league: League;
  draft: DraftState;
  getPlayer: (id: string) => Player | undefined;
  getEvaluation: (id: string) => PlayerEvaluation | undefined;
}): DraftRecap {
  const strategyId = opts.league.strategyId ?? 'balanced';
  const adherencePicks = picksFromEvents(opts.draft.picks, opts.draft.userRosterId, (id) => {
    // Sleeper ids may not map to seed players — skip unknown.
    return opts.getPlayer(id)?.position ?? null;
  });
  const adherence = scoreAdherence(strategyId, adherencePicks);

  const userPicks = opts.draft.picks.filter((p) => p.rosterId === opts.draft.userRosterId && p.playerId);
  const rosterByPosition: DraftRecap['rosterByPosition'] = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DEF: [],
  };
  let scoreSum = 0;
  let scored = 0;
  let bestValue: DraftRecap['bestValue'] = null;
  let worstValue: DraftRecap['worstValue'] = null;

  for (const pick of userPicks) {
    const player = opts.getPlayer(pick.playerId!);
    const evaluation = opts.getEvaluation(pick.playerId!);
    if (!player || !evaluation) continue;
    rosterByPosition[player.position].push({
      id: player.id,
      name: player.name,
      draftScore: evaluation.draftScore,
      pickNumber: pick.pickNumber,
    });
    scoreSum += evaluation.draftScore;
    scored += 1;
    const value = evaluation.value.valueScore;
    const entry = { id: player.id, name: player.name, valueScore: value, pickNumber: pick.pickNumber };
    if (!bestValue || value > bestValue.valueScore) bestValue = entry;
    if (!worstValue || value < worstValue.valueScore) worstValue = entry;
  }

  const weaknesses: string[] = [];
  const shape = opts.league.roster;
  (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as Position[]).forEach((pos) => {
    const need =
      pos === 'QB'
        ? shape.qb + shape.superflex
        : pos === 'RB'
          ? shape.rb
          : pos === 'WR'
            ? shape.wr
            : pos === 'TE'
              ? shape.te
              : pos === 'K'
                ? (shape.k ?? 0)
                : (shape.def ?? 0);
    if (need > 0 && rosterByPosition[pos].length < need) {
      weaknesses.push(`Short ${pos}: ${rosterByPosition[pos].length}/${need} starters`);
    }
  });
  if (adherence.state !== 'on_plan') {
    weaknesses.push(`Strategy ${adherence.state.replace('_', ' ')} (${adherence.score}% adherence)`);
  }

  return {
    leagueId: opts.league.id,
    strategyId,
    adherence,
    rosterByPosition,
    meanDraftScore: scored ? Math.round((scoreSum / scored) * 10) / 10 : 0,
    bestValue,
    worstValue,
    weaknesses,
    recommendationLog: userPicks.map((p) => ({
      pickNumber: p.pickNumber,
      taken: opts.getPlayer(p.playerId!)?.name ?? p.playerId,
      note: 'Recorded for calibration vs recommendations',
    })),
  };
}

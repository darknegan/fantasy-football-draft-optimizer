import type { Player, PlayerEvaluation } from '@draftlab/domain';
import { buildMultiYearCurve, dynastyCompositeScore } from './value-curve.js';

export interface RookieBoardRow {
  playerId: string;
  name: string;
  position: Player['position'];
  age: number;
  draftRound: number | null;
  draftScore: number;
  npv: number;
  dynastyScore: number;
  note: string;
}

/** Separate rookie board: players with seasonsInLeague === 0 (or draftYear === season). */
export function buildRookieBoard(
  players: Array<{ player: Player; evaluation: PlayerEvaluation }>,
  season: number,
  mode: 'contend' | 'rebuild' | 'neutral' = 'rebuild',
): RookieBoardRow[] {
  const rookies = players.filter(
    (p) => p.player.seasonsInLeague === 0 || p.player.draftYear === season,
  );

  return rookies
    .map(({ player, evaluation }) => {
      const curve = buildMultiYearCurve(player, evaluation, season);
      const dynastyScore = dynastyCompositeScore(evaluation.draftScore, curve.npv, mode);
      const note =
        player.draftRound === 1
          ? 'Day-1 capital — cornerstone dynasty asset'
          : player.age <= 22
            ? 'Young developmental upside'
            : 'Rookie with shorter window — price carefully';
      return {
        playerId: player.id,
        name: player.name,
        position: player.position,
        age: player.age,
        draftRound: player.draftRound,
        draftScore: evaluation.draftScore,
        npv: curve.npv,
        dynastyScore,
        note,
      };
    })
    .sort((a, b) => b.dynastyScore - a.dynastyScore);
}

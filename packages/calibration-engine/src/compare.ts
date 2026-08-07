import type { DraftOutcome, RecVsActualRow } from '@draftlab/domain';

export function buildRecVsActual(
  outcomes: DraftOutcome[],
  nameOf: (id: string) => string | null,
): RecVsActualRow[] {
  return [...outcomes]
    .sort((a, b) => a.pickNumber - b.pickNumber)
    .map((o) => ({
      pickNumber: o.pickNumber,
      recommendedPlayerId: o.recommendedPlayerId,
      recommendedName: o.recommendedPlayerId ? nameOf(o.recommendedPlayerId) : null,
      actualPlayerId: o.actualPlayerId,
      actualName: nameOf(o.actualPlayerId) ?? o.actualPlayerId,
      followed: o.followed,
      rankDelta: o.actualRankAtPick != null ? o.actualRankAtPick - 1 : null,
    }));
}

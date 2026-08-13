import type { Position, RosterShape } from '@draftlab/domain';
import type { ReplacementBand } from './types.js';

const FLEX_ELIGIBLE: readonly Position[] = ['RB', 'WR', 'TE'];

/** Starter slots per team at this position, including superflex for QB. */
function starterSlotsPerTeam(position: Position, roster: RosterShape): number {
  switch (position) {
    case 'QB':
      return roster.qb + roster.superflex;
    case 'RB':
      return roster.rb;
    case 'WR':
      return roster.wr;
    case 'TE':
      return roster.te;
    default:
      return 0;
  }
}

/**
 * Which roster slot a player's positional rank realistically fills in THIS league.
 *
 * Band i covers ranks (i-1)*teamCount+1 .. i*teamCount, for i up to the number of
 * starter slots at the position. So in a 12-team, 2-RB league, RB ranks 1-12 are
 * RB1 and 13-24 are RB2. Past the starter bands come flex (for flex-eligible
 * positions only), then bench.
 *
 * Depends only on league shape, never on who is still available, so a player's
 * band does not move as the draft progresses.
 */
export function replacementBand(
  positionRank: number,
  position: Position,
  roster: RosterShape,
  teamCount: number,
): ReplacementBand {
  // A rank is 1-indexed by contract. Anything else is a caller bug; degrade to
  // BENCH rather than emitting a malformed band id like "RB0" or "RBNaN".
  if (!Number.isFinite(positionRank) || positionRank < 1) {
    return { id: 'BENCH', label: 'BENCH' };
  }

  const starterSlots = starterSlotsPerTeam(position, roster);
  const starterCapacity = starterSlots * teamCount;

  if (positionRank <= starterCapacity) {
    const bandIndex = Math.ceil(positionRank / teamCount);
    const id = `${position}${bandIndex}`;
    return { id, label: id };
  }

  const flexCapacity = FLEX_ELIGIBLE.includes(position) ? roster.flex * teamCount : 0;
  if (positionRank <= starterCapacity + flexCapacity) {
    return { id: 'FLEX', label: 'FLEX' };
  }

  return { id: 'BENCH', label: 'BENCH' };
}

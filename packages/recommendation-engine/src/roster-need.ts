import type { Player, Position, PositionNeed, RosterShape } from '@draftlab/domain';
import { emptyPositionCounts, SKILL_POSITIONS } from '@draftlab/domain';

const FLEX_ELIGIBLE: Position[] = ['RB', 'WR', 'TE'];

export function countByPosition(roster: Player[]): Record<Position, number> {
  const counts = emptyPositionCounts();
  for (const p of roster) counts[p.position] += 1;
  return counts;
}

export function computePositionNeeds(roster: Player[], shape: RosterShape): PositionNeed[] {
  const counts = countByPosition(roster);
  const positions: Position[] = [...SKILL_POSITIONS];
  if ((shape.k ?? 0) > 0) positions.push('K');
  if ((shape.def ?? 0) > 0) positions.push('DEF');

  return positions.map((position) => {
    const required =
      position === 'QB'
        ? shape.qb + shape.superflex
        : position === 'RB'
          ? shape.rb
          : position === 'WR'
            ? shape.wr
            : position === 'TE'
              ? shape.te
              : position === 'K'
                ? (shape.k ?? 0)
                : (shape.def ?? 0);

    const filled = counts[position];
    const flexEligible = FLEX_ELIGIBLE.includes(position);
    // Urgency: 1.0 when empty starter slot, decays as filled; flex adds soft need.
    let urgency = 0;
    if (filled < required) {
      urgency = 1.0 - filled / Math.max(required, 1);
    } else if (flexEligible) {
      const flexFilled = Math.max(
        0,
        counts.RB + counts.WR + counts.TE - shape.rb - shape.wr - shape.te,
      );
      if (flexFilled < shape.flex) {
        urgency = 0.35 * (1 - flexFilled / Math.max(shape.flex, 1));
      } else {
        urgency = 0.1; // bench depth
      }
    } else {
      urgency = 0.05;
    }

    return { position, filled, required, flexEligible, urgency: Math.round(urgency * 100) / 100 };
  });
}

/** Multiplier in ~[0.75, 1.35] from need urgency. */
export function rosterNeedMultiplier(position: Position, needs: PositionNeed[]): number {
  const need = needs.find((n) => n.position === position);
  const urgency = need?.urgency ?? 0.2;
  return 0.75 + urgency * 0.6;
}

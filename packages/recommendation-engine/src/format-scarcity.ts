import type { Position, RosterShape, ScoringProfile } from '@draftlab/domain';

// How much of a FLEX/SUPERFLEX slot's demand each eligible position absorbs in
// practice. Sleeper's roster_positions only says a slot is FLEX/SUPERFLEX
// eligible, not which position actually ends up there — there's no data
// source for that, so these are standard fantasy-analyst assumptions, not
// measured. Most superflex slots go to a QB (higher weekly ceiling than a
// second flex-caliber RB/WR); flex slots split roughly evenly between RB/WR,
// rarely TE.
const FLEX_SHARE: Record<'RB' | 'WR' | 'TE', number> = { RB: 0.45, WR: 0.45, TE: 0.1 };
const SUPERFLEX_QB_SHARE = 0.75;

function startingDemandPerTeam(position: Position, roster: RosterShape): number {
  switch (position) {
    case 'QB':
      return roster.qb + roster.superflex * SUPERFLEX_QB_SHARE;
    case 'RB':
      return roster.rb + roster.flex * FLEX_SHARE.RB;
    case 'WR':
      return roster.wr + roster.flex * FLEX_SHARE.WR;
    case 'TE':
      return roster.te + roster.flex * FLEX_SHARE.TE;
  }
}

// How close a position's league-wide starting demand sits to fully exhausting
// its real draftable pool, as a replacement-level "distance to the cliff"
// curve rather than a flat ratio. x/(1-x) is the standard queueing-theory
// shape for utilization vs. wait time: urgency rises gently while there's
// slack, then climbs sharply as demand approaches supply. Capped short of 1
// so a position whose demand meets or exceeds its pool (a real thing: a
// deep-bench, single-QB, 24-team league can need more TE starters than
// realistic TEs exist) spikes hard without dividing by zero.
const UTILIZATION_CAP = 0.95;
function replacementCliffUrgency(ratio: number): number {
  const x = Math.min(ratio, UTILIZATION_CAP);
  return x / (1 - x);
}

/**
 * How scarce a position's STARTING roster slots are in this specific league,
 * given its real roster requirements, its real draftable pool at each
 * position, AND its team count — not draft-pick timing (see
 * scarcityUrgencyMultiplier for that; this is a different kind of scarcity
 * and deliberately not merged with it).
 *
 * A 2QB/superflex league needs roughly double the QB starters of a standard
 * league from a similarly-sized pool of real QBs — the effect that inflates
 * QB ADP in those formats. A single draftScore has no way to know that on its
 * own; this reads it straight from the league's actual roster config instead
 * of assuming one format for every league.
 *
 * Self-calibrating: each position's urgency is compared against the AVERAGE
 * urgency across all four positions in this same league, rather than a
 * hardcoded "normal" level — so a standard 1-QB league (where QB isn't
 * remarkable relative to RB/WR/TE) doesn't get an artificial QB boost just
 * for existing, while a real 2QB/superflex league (where QB's demand/pool
 * ratio is well above the other three) does.
 *
 * Team count matters here, unlike a plain demand/pool ratio would: every
 * position's demand scales by the same team count, so a LINEAR ratio-vs-
 * average cancels that factor out exactly regardless of its value (provably —
 * ratio(pos)/avg(ratio) is scale-invariant under a common multiplier). Real
 * drafts don't behave that way: as a league grows, positions with less real
 * depth behind their starters (TE, sometimes RB) get disproportionately
 * scarcer than deep ones (WR), not just uniformly scarcer alongside them.
 * Running each position's ratio through the convex replacementCliffUrgency
 * curve before averaging breaks that cancellation on purpose, so a bigger
 * league (or a deeper starting requirement) pushes shallow positions up
 * faster than deep ones -- reintroducing real team-count sensitivity.
 *
 * poolSizeByPosition should be the count of realistically draftable players
 * at each position in this league's own universe (e.g. the current board),
 * not a fixed league-wide constant — a shallower pool at a position makes the
 * same roster requirement scarcer.
 *
 * Returns a multiplier clamped to [0.5, 2.2] -- wider than a first pass might
 * pick, because genuinely extreme formats (2-QB-required leagues, 20-team
 * superflex dynasties) produce real ratios that a tight clamp would flatten
 * back into looking like every other league.
 */
export function positionalFormatScarcity(
  position: Position,
  roster: RosterShape,
  teamCount: number,
  poolSizeByPosition: Record<Position, number>,
  scoring?: ScoringProfile,
): number {
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE'];
  const urgencies = positions.map((pos) => {
    const demand = startingDemandPerTeam(pos, roster) * teamCount;
    const supply = Math.max(poolSizeByPosition[pos] ?? 1, 1);
    return replacementCliffUrgency(demand / supply);
  });
  const avgUrgency = urgencies.reduce((a, b) => a + b, 0) / urgencies.length;

  const thisDemand = startingDemandPerTeam(position, roster) * teamCount;
  const thisSupply = Math.max(poolSizeByPosition[position] ?? 1, 1);
  const thisUrgency = replacementCliffUrgency(thisDemand / thisSupply);

  const raw = avgUrgency > 0 ? thisUrgency / avgUrgency : 1;
  let mult = Math.max(0.5, Math.min(2.2, raw));

  // TE premium scoring makes a real receiving TE score closer to a WR1,
  // widening the gap between TE1 and replacement-level TE — a modest bump
  // proportional to the bonus size, not a full re-derivation of TE value.
  if (position === 'TE' && scoring?.tePremiumBonus) {
    mult *= 1 + Math.min(0.15, scoring.tePremiumBonus * 0.1);
  }

  return Math.round(mult * 1000) / 1000;
}

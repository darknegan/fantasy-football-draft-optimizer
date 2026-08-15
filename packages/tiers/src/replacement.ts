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

export type VorScoringFormat = 'ppr' | 'half_ppr' | 'standard';

/** How much of the FLEX pool each skill position typically claims. */
const FLEX_SHARES: Record<VorScoringFormat, Record<'RB' | 'WR' | 'TE', number>> = {
  ppr: { RB: 0.25, WR: 0.65, TE: 0.1 },
  half_ppr: { RB: 0.4, WR: 0.5, TE: 0.1 },
  standard: { RB: 0.55, WR: 0.35, TE: 0.1 },
};

export function resolveVorScoringFormat(input: {
  reception?: number | null;
  variant?: string | null;
} = {}): VorScoringFormat {
  const variant = input.variant?.toLowerCase();
  if (variant === 'ppr' || variant === 'half_ppr' || variant === 'standard') {
    return variant;
  }
  const reception = input.reception;
  if (typeof reception === 'number') {
    if (reception >= 0.75) return 'ppr';
    if (reception >= 0.25) return 'half_ppr';
    return 'standard';
  }
  return 'ppr';
}

/**
 * Split `total` across keys by share using largest-remainder so the parts
 * always sum back to `total` (plain Math.round can over-allocate).
 */
function allocateByShare<K extends string>(
  total: number,
  shares: Record<K, number>,
): Record<K, number> {
  const keys = Object.keys(shares) as K[];
  const raw = keys.map((key) => {
    const exact = total * shares[key];
    const floor = Math.floor(exact);
    return { key, floor, remainder: exact - floor };
  });
  const allocated = Object.fromEntries(raw.map((row) => [row.key, row.floor])) as Record<
    K,
    number
  >;
  let leftover = total - raw.reduce((sum, row) => sum + row.floor, 0);
  raw
    .slice()
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((row) => {
      if (leftover <= 0) return;
      allocated[row.key] += 1;
      leftover -= 1;
    });
  return allocated;
}

/**
 * How many players at this position can start in THIS league (dedicated
 * slots + a format-weighted share of FLEX for RB/WR/TE, dedicated +
 * superflex for QB).
 *
 * This is the VOR replacement rank: the last startable player, 1-indexed.
 */
export function startableCapacity(
  position: Position,
  roster: RosterShape,
  teamCount: number,
  format: VorScoringFormat = 'ppr',
): number {
  const starters = starterSlotsPerTeam(position, roster) * teamCount;
  if (position !== 'RB' && position !== 'WR' && position !== 'TE') {
    return starters;
  }
  const flexPool = roster.flex * teamCount;
  return starters + allocateByShare(flexPool, FLEX_SHARES[format])[position];
}

export interface VorPlayer {
  id: string;
  position: Position;
  projectedPoints: number | null | undefined;
}

/**
 * Projected points above the last startable player at the same position.
 *
 * Baseline is the Nth-highest proj at that position, where N is
 * `startableCapacity`. When the pool is thinner than N, the last available
 * player is the baseline (so the worst measured player at a thin position
 * scores 0, not a fabricated replacement). Missing proj → null.
 */
export function computeVor(
  players: readonly VorPlayer[],
  roster: RosterShape,
  teamCount: number,
  format: VorScoringFormat = 'ppr',
): ReadonlyMap<string, number | null> {
  const byPos = new Map<Position, VorPlayer[]>();
  for (const player of players) {
    const list = byPos.get(player.position) ?? [];
    list.push(player);
    byPos.set(player.position, list);
  }

  const out = new Map<string, number | null>();
  for (const [position, list] of byPos) {
    const ranked = list
      .filter((p) => p.projectedPoints != null && Number.isFinite(p.projectedPoints))
      .sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0));
    const cap = startableCapacity(position, roster, teamCount, format);
    const replIndex = Math.min(cap, ranked.length) - 1;
    const baseline = replIndex >= 0 ? ranked[replIndex]!.projectedPoints! : 0;
    for (const player of list) {
      if (player.projectedPoints == null || !Number.isFinite(player.projectedPoints)) {
        out.set(player.id, null);
      } else {
        out.set(player.id, Math.round((player.projectedPoints - baseline) * 10) / 10);
      }
    }
  }
  return out;
}

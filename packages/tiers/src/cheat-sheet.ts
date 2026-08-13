import type { Position } from '@draftlab/domain';
import { qualityBand } from './quality.js';
import type { QualityBand, TierRow } from './types.js';

export interface CheatSheetPlayer extends TierRow {
  name: string;
  ceilingScore: number | null;
  provisional: boolean;
  target?: boolean;
  avoid?: boolean;
}

export interface CheatSheetTier {
  /**
   * `null` marks the no-data tier: players whose ceiling factors are all
   * unmeasured, so `qualityBand` itself returns `null` rather than laundering
   * them into a real letter grade. See the design doc's "No-data players"
   * rule — the quality chip renders `—`, not a letter, because the underlying
   * score is defaults rather than a judgment. This tier keeps that contract:
   * it must never be conflated with the genuine `'D'` (Speculative) tier.
   */
  tier: QualityBand | null;
  label: string;
  players: CheatSheetPlayer[];
}

export interface CheatSheetGroup {
  position: Position;
  tiers: CheatSheetTier[];
}

const TIER_ORDER: Array<{ tier: QualityBand | null; label: string }> = [
  { tier: 'S', label: 'Elite' },
  { tier: 'A', label: 'High' },
  { tier: 'B', label: 'Solid' },
  { tier: 'C', label: 'Depth' },
  { tier: 'D', label: 'Speculative' },
  { tier: null, label: 'No data' },
];

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

/**
 * Positional cheat sheet built on absolute quality bands.
 *
 * The grouping is still per position, but the LETTERS are global: a position with
 * no genuinely elite players shows no S tier, rather than promoting its best
 * available player by construction as the previous min-max implementation did.
 *
 * There is no separate `unranked` list, but no-data players are also not
 * folded into the `D` (Speculative) tier: `qualityBand` returns `null` for
 * them, and that `null` is kept as its own distinct "No data" tier rather
 * than defaulted to `'D'`. Merging the two would hand a no-data player a real
 * letter grade — a judgment the underlying (all-default) score can't support,
 * and a contradiction of the board's own `—` rendering for the same case.
 */
export function buildCheatSheet(players: CheatSheetPlayer[]): CheatSheetGroup[] {
  return POSITIONS.map((position) => {
    const atPosition = players
      .filter((p) => p.position === position)
      .sort((a, b) => b.draftScore - a.draftScore);

    const buckets = new Map<QualityBand | null, CheatSheetPlayer[]>();
    for (const player of atPosition) {
      const band = qualityBand(player.draftScore, player.ceilingKnownFactors);
      const list = buckets.get(band) ?? [];
      list.push(player);
      buckets.set(band, list);
    }

    const tiers = TIER_ORDER.filter(({ tier }) => (buckets.get(tier)?.length ?? 0) > 0).map(
      ({ tier, label }) => ({ tier, label, players: buckets.get(tier)! }),
    );

    return { position, tiers };
  }).filter((group) => group.tiers.length > 0);
}

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
  tier: QualityBand;
  label: string;
  players: CheatSheetPlayer[];
}

export interface CheatSheetGroup {
  position: Position;
  tiers: CheatSheetTier[];
}

const TIER_ORDER: Array<{ tier: QualityBand; label: string }> = [
  { tier: 'S', label: 'Elite' },
  { tier: 'A', label: 'High' },
  { tier: 'B', label: 'Solid' },
  { tier: 'C', label: 'Depth' },
  { tier: 'D', label: 'Speculative' },
];

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

/**
 * Positional cheat sheet built on absolute quality bands.
 *
 * The grouping is still per position, but the LETTERS are global: a position with
 * no genuinely elite players shows no S tier, rather than promoting its best
 * available player by construction as the previous min-max implementation did.
 *
 * There is no separate `unranked` list. No-data players stay in the sheet with a
 * D band, because absolute bands mean they can no longer distort anyone else's
 * grade — the reason the old implementation had to segregate them.
 */
export function buildCheatSheet(players: CheatSheetPlayer[]): CheatSheetGroup[] {
  return POSITIONS.map((position) => {
    const atPosition = players
      .filter((p) => p.position === position)
      .sort((a, b) => b.draftScore - a.draftScore);

    const buckets = new Map<QualityBand, CheatSheetPlayer[]>();
    for (const player of atPosition) {
      const band = qualityBand(player.draftScore, player.ceilingKnownFactors) ?? 'D';
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

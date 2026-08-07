import type { Position } from '@draftlab/domain';

export type CheatTier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface TierPlayer {
  id: string;
  name: string;
  position: Position;
  draftScore: number;
  ceilingScore: number | null;
  provisional: boolean;
  adpRoundPick: string;
  target?: boolean;
  avoid?: boolean;
}

export interface CheatSheetTier {
  tier: CheatTier;
  label: string;
  players: TierPlayer[];
}

export interface CheatSheetGroup {
  position: Position;
  tiers: CheatSheetTier[];
}

const TIER_CUTS: Array<{ tier: CheatTier; minPct: number; label: string }> = [
  { tier: 'S', minPct: 0.9, label: 'Elite' },
  { tier: 'A', minPct: 0.75, label: 'High' },
  { tier: 'B', minPct: 0.5, label: 'Solid' },
  { tier: 'C', minPct: 0.25, label: 'Depth' },
  { tier: 'D', minPct: 0, label: 'Speculative' },
];

/**
 * Build a positional cheat sheet by DraftScore percentiles within each position.
 * Targets float up one tier visually in the UI; avoids are kept but flagged.
 */
export function buildCheatSheet(players: TierPlayer[]): CheatSheetGroup[] {
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE'];
  return positions.map((position) => {
    const pool = players
      .filter((p) => p.position === position)
      .sort((a, b) => b.draftScore - a.draftScore);

    if (pool.length === 0) {
      return { position, tiers: [] };
    }

    const scores = pool.map((p) => p.draftScore);
    const max = scores[0]!;
    const min = scores[scores.length - 1]!;
    const span = Math.max(max - min, 1e-6);

    const buckets: Record<CheatTier, TierPlayer[]> = { S: [], A: [], B: [], C: [], D: [] };

    for (const p of pool) {
      const pct = (p.draftScore - min) / span;
      const cut = TIER_CUTS.find((c) => pct >= c.minPct) ?? TIER_CUTS[TIER_CUTS.length - 1]!;
      buckets[cut.tier].push(p);
    }

    const tiers: CheatSheetTier[] = TIER_CUTS.map((c) => ({
      tier: c.tier,
      label: c.label,
      players: buckets[c.tier],
    })).filter((t) => t.players.length > 0);

    return { position, tiers };
  });
}

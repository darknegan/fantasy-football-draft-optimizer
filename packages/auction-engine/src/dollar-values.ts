import type { AuctionPlayerValue, PlayerEvaluation, Position } from '@draftlab/domain';

export interface ValueInput {
  playerId: string;
  position: Position;
  draftScore: number;
  /** Optional explicit VORP; falls back to draftScore-relative share. */
  vorp?: number | null;
}

/**
 * Convert VORP / DraftScore into dollar values for a fixed auction budget pool.
 * Uses a power curve so top talent captures disproportionate spend (matches auction reality).
 */
export function computeDollarValues(
  players: ValueInput[],
  opts: {
    teamCount: number;
    budgetPerTeam: number;
    rosterSlots: number;
    /** Dollars reserved so every team can fill remaining $1 stubs. */
    stubReservePerTeam?: number;
    inflationRate?: number;
  },
): AuctionPlayerValue[] {
  const stub = opts.stubReservePerTeam ?? opts.rosterSlots;
  const spendPool = Math.max(0, opts.teamCount * (opts.budgetPerTeam - stub));
  const inflation = opts.inflationRate ?? 0;

  const raw = players.map((p) => {
    const vorp = p.vorp != null && p.vorp > 0 ? p.vorp : Math.max(0, p.draftScore - 40);
    // Power > 1 concentrates dollars at the top.
    const weight = Math.pow(Math.max(vorp, 0.5), 1.35);
    return { ...p, vorp, weight };
  });

  const totalWeight = raw.reduce((s, p) => s + p.weight, 0) || 1;

  return raw
    .map((p) => {
      const vorpShare = p.weight / totalWeight;
      const fairValue = Math.max(1, Math.round(spendPool * vorpShare));
      const inflatedValue = Math.max(1, Math.round(fairValue * (1 + inflation)));
      return {
        playerId: p.playerId,
        fairValue,
        inflatedValue,
        vorpShare: Math.round(vorpShare * 10000) / 10000,
      };
    })
    .sort((a, b) => b.fairValue - a.fairValue);
}

/** Approximate VORP from evaluation when explicit VORP ranks are unavailable. */
export function vorpFromEvaluation(evaluation: PlayerEvaluation): number {
  // Blend ceiling + draftScore; provisional RBs lean on draftScore only.
  const ceiling = evaluation.ceiling.ceilingScore;
  if (ceiling == null || evaluation.ceiling.provisional) {
    return Math.max(0, evaluation.draftScore - 35);
  }
  return Math.max(0, ceiling * 2.2 + evaluation.draftScore * 0.4);
}

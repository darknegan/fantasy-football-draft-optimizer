import type { SurvivalBand, SurvivalCuts, TierRow } from './types.js';

export interface SurvivalInput {
  /** Player ADP as overall pick number (1-based). */
  adpOverall: number;
  /** Overall pick number of the user's next selection. */
  nextUserPickOverall: number;
  /** Picks remaining before that selection (0 = on the clock). */
  picksUntilNext: number;
  /** 0–1 boost when a position run is draining this player's position faster than ADP. */
  positionRunFactor?: number;
}

/**
 * Rough P(player still available at the user's next pick).
 * Used on live-draft recommendation cards — not a full Monte Carlo.
 *
 * Relocated verbatim from recommendation-engine/scarcity.ts so that @draftlab/tiers
 * stays a leaf package; recommendation-engine now imports it from here.
 */
export function estimateSurvivalProbability(input: SurvivalInput): number {
  const picksUntilNext = Math.max(0, input.picksUntilNext);
  const slack = input.adpOverall - input.nextUserPickOverall;
  // Near the next pick ADP → ~50%; later ADP → higher; earlier → lower.
  let p = 0.52 + slack / (2 * Math.max(8, picksUntilNext + 4));
  if (slack < -picksUntilNext) {
    p = 0.08 + Math.max(0, 0.12 + slack / 50);
  }
  if (picksUntilNext === 0) {
    // On the clock — survival-to-next-turn is about the pick AFTER this one.
    p = 0.45 + slack / 24;
  }
  const run = Math.min(1, Math.max(0, input.positionRunFactor ?? 0));
  p *= 1 - 0.35 * run;
  return Math.round(Math.min(0.92, Math.max(0.05, p)) * 100) / 100;
}

/**
 * Parse "round.pick" ADP into an overall pick number.
 *
 * Returns null — NOT a large sentinel — when the input is unusable. A sentinel
 * reads as "very late" downstream, which fabricates a survival claim for a player
 * whose ADP we simply do not have.
 */
export function adpOverall(adpRoundPick: string, teamCount: number): number | null {
  const match = /^(\d+)\.(\d+)$/.exec(adpRoundPick.trim());
  if (!match) return null;
  const round = Number(match[1]);
  const slot = Number(match[2]);
  if (!Number.isFinite(round) || !Number.isFinite(slot) || round < 1 || slot < 1) return null;
  return (round - 1) * teamCount + slot;
}

/** Starting cut-points from the design doc; confirm against real data. */
export const SURVIVAL_CUTS: SurvivalCuts = { gone: 0.25, coinFlip: 0.65 };

const BAND_LABELS = {
  gone: 'Gone before your next pick',
  'coin-flip': 'Coin flip',
  available: 'Should be there',
  'adp-unknown': 'ADP unknown',
} as const;

/**
 * Partition rows by how likely they are to survive to the user's next pick.
 *
 * This is the board's section partition: it answers "take now or wait", which is
 * the actual draft-day decision. Consequence accepted deliberately — the board is
 * no longer globally ranked by score, because bands follow ADP.
 *
 * picksUntilNext is passed in rather than derived: the caller owns draft state.
 */
export function survivalBands<T extends TierRow>(
  rows: T[],
  nextPickOverall: number,
  picksUntilNext: number,
  teamCount: number,
  cuts: SurvivalCuts = SURVIVAL_CUTS,
): SurvivalBand<T>[] {
  const buckets: Record<SurvivalBand['id'], T[]> = {
    gone: [],
    'coin-flip': [],
    available: [],
    'adp-unknown': [],
  };

  for (const row of rows) {
    const adp = adpOverall(row.adpRoundPick, teamCount);
    if (adp === null) {
      buckets['adp-unknown'].push(row);
      continue;
    }
    const p = estimateSurvivalProbability({
      adpOverall: adp,
      nextUserPickOverall: nextPickOverall,
      picksUntilNext,
    });
    if (p < cuts.gone) buckets.gone.push(row);
    else if (p < cuts.coinFlip) buckets['coin-flip'].push(row);
    else buckets.available.push(row);
  }

  const order: Array<SurvivalBand['id']> = ['gone', 'coin-flip', 'available', 'adp-unknown'];
  return order
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, label: BAND_LABELS[id], rows: buckets[id] }));
}

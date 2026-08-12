import type { CliffMarker } from './types.js';

/**
 * How many times the baseline gap an adjacent gap must be to count as a cliff.
 *
 * Confirmed against 221 real players (sleeperMCP player_factors.json v5), not
 * assumed. The design doc's provisional 2.5 was far too low: draftScore is
 * rounded to one decimal, and across 221 players 147 of the 220 adjacent gaps
 * are <= 0.1, so the MEDIAN gap collapses onto the 0.1 rounding quantum. At
 * k=2.5 the threshold is therefore 0.25 and every 0.3 gap in the dense elite
 * cluster fires — 42 cliffs on a 221-row board, which is noise, and markers
 * appeared between adjacent near-ties (Amon-Ra St. Brown 70.4 -> George Pickens
 * 70.0).
 *
 * 5.0 is the smallest value that stops firing inside those near-tie clusters
 * while keeping every per-position break a human would draw: RB after Gibbs
 * (#2), Kyren Williams (#4), Achane (#8) and Kenneth Walker (#11); TE after
 * McBride (#1), Kittle (#3) and Ferguson (#5); the full board after Pickens
 * (70.0 -> Bijan Robinson 67.0) and after Travis Kelce (63.0 -> Chase Brown
 * 61.9). Measured counts at k=5: 15 on the unfiltered 221-row board, QB 2/36,
 * RB 6/68, WR 10/91, TE 5/26, and ~6 across eight consecutive 25-row slices.
 * Pushing k to 8-10 does hit the 3-8 target on the unfiltered board but strips
 * RB down to a single cliff at rank 67, losing the RB1/RB2 boundary — the most
 * load-bearing break on a fantasy board — so it was rejected.
 *
 * Known limitation, orthogonal to k: because the baseline is the median gap, a
 * longer list has a SMALLER threshold in absolute points (0.5 across all 221,
 * but 1.5 within RB alone). The unfiltered board is consequently the noisiest
 * case rather than the cleanest. A floor on the baseline would fix that
 * properly; k alone cannot.
 */
export const DEFAULT_CLIFF_K = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Find genuine dropoffs in a DESCENDING-sorted score list.
 *
 * A fixed point threshold is unusable on draftScore: it is a weighted blend, so
 * adjacent gaps are tiny in the crowded middle of the distribution and large in
 * the sparse tails. An absolute cut-off fires constantly at the tails and never
 * in the middle. Comparing each gap against the MEDIAN gap self-scales; the
 * median specifically (rather than a mean or z-score) keeps a few huge tail gaps
 * from inflating the threshold and masking real mid-board cliffs.
 *
 * @param scores Descending-sorted scores. Not sorted defensively — callers own order.
 * @param k Multiple of the baseline gap required to flag a cliff.
 */
export function detectCliffs(scores: number[], k: number = DEFAULT_CLIFF_K): CliffMarker[] {
  if (scores.length < 2) return [];

  const gaps: number[] = [];
  for (let i = 0; i < scores.length - 1; i++) {
    gaps.push(scores[i]! - scores[i + 1]!);
  }

  let baseline = median([...gaps].sort((a, b) => a - b));

  if (baseline === 0) {
    // More than half the gaps are ties. k * 0 would make every nonzero gap a
    // cliff, so fall back to the mean of the gaps that do exist.
    const nonZero = gaps.filter((g) => g > 0);
    if (nonZero.length === 0) return [];
    baseline = nonZero.reduce((sum, g) => sum + g, 0) / nonZero.length;
  }

  const threshold = k * baseline;
  const cliffs: CliffMarker[] = [];
  gaps.forEach((gap, index) => {
    if (gap > 0 && gap >= threshold) {
      cliffs.push({ afterIndex: index, gap: round1(gap), multiple: round1(gap / baseline) });
    }
  });
  return cliffs;
}

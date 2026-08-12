import type { CliffMarker } from './types.js';

/**
 * How many times the baseline gap an adjacent gap must be to count as a cliff.
 * Starting value from the design doc; confirm by inspecting where cliffs land on
 * real data before treating it as settled.
 */
export const DEFAULT_CLIFF_K = 2.5;

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

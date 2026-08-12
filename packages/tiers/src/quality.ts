import type { QualityBand } from './types.js';

/**
 * Absolute cut-points on the 0-100 draftScore. ONE global set, not per-position:
 * draftScore is already position-normalised upstream (normaliseCeiling scales
 * against CEILING_RANGE[position] in evaluation-engine/draft-score.ts), and the
 * archetype, value and risk components are position-agnostic. Re-normalising here
 * would double-apply that correction.
 *
 * Starting values from the design doc — confirm against the real score
 * distribution before treating them as settled.
 */
export const QUALITY_THRESHOLDS = {
  S: 85,
  A: 75,
  B: 62,
  C: 48,
} as const;

/**
 * Grade a player on intrinsic quality alone. Deliberately independent of the
 * visible pool: filtering to one position, or players coming off the board, must
 * never change a grade.
 *
 * Returns null when no ceiling factor is actually measured — the underlying
 * draftScore is then mostly generic defaults, so a letter would overstate it.
 */
export function qualityBand(draftScore: number, ceilingKnownFactors: number): QualityBand | null {
  if (ceilingKnownFactors === 0) return null;
  if (draftScore >= QUALITY_THRESHOLDS.S) return 'S';
  if (draftScore >= QUALITY_THRESHOLDS.A) return 'A';
  if (draftScore >= QUALITY_THRESHOLDS.B) return 'B';
  if (draftScore >= QUALITY_THRESHOLDS.C) return 'C';
  return 'D';
}

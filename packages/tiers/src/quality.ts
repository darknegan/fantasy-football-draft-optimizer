import type { QualityBand } from './types.js';

/**
 * Absolute cut-points on the 0-100 draftScore. ONE global set, not per-position:
 * draftScore is already position-normalised upstream (normaliseCeiling scales
 * against CEILING_RANGE[position] in evaluation-engine/draft-score.ts), and the
 * archetype, value and risk components are position-agnostic. Re-normalising here
 * would double-apply that correction.
 *
 * Confirmed against 221 real players (sleeperMCP player_factors.json v5), not
 * assumed. The design doc's provisional { S: 85, A: 75, B: 62, C: 48 } was
 * calibrated to a 0-100 scale draftScore never actually occupies: the real
 * spread is 33.0 to 75.7, so S was unreachable and A caught exactly one player
 * (S 0 / A 1 / B 16 / C 134 / D 70). That is not a quirk of this artifact —
 * no component reaches 100 (ceiling maxes at 70.6 after normaliseCeiling,
 * value at 62.9 because the mechanical-rank fallback is damped to 0.3
 * confidence, risk sits at ~92 for nearly everyone), so the weighted blend
 * cannot exceed ~78 even if one player led every component.
 *
 * Re-cut against the observed distribution: S 5 / A 12 / B 40 / C 94 / D 70.
 * S is the elite block (Puka Nacua 75.7 down to George Pickens 70.0), S+A ends
 * at rank 17 (Travis Kelce 63.0) — about the first round and a half — and B
 * ends near rank 57, roughly round 5.
 *
 * These are absolute cut-points and stay fixed as the pool drains, by design.
 * They are however tied to the current score scale: if fseRank or
 * espnProjectionRank ever get populated, the value component stops being
 * damped, the range widens, and these need re-cutting against fresh output.
 */
export const QUALITY_THRESHOLDS = {
  S: 70,
  A: 63,
  B: 56,
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

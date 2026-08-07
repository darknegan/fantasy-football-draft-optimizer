import type { CeilingResult, DraftScoreWeights, ValueResult, RiskResult, ArchetypeResult } from '@draftlab/domain';
import { CEILING_MAX, CEILING_MIN } from './config/grade-weights.js';

export const DEFAULT_WEIGHTS: DraftScoreWeights = {
  ceiling: 0.4,
  archetype: 0.25,
  value: 0.2,
  risk: 0.15,
};

/** Normalise CeilingScore from [-36, 60] → [0, 100]. */
export function normaliseCeiling(score: number | null): number {
  if (score == null) return 50; // provisional / unknown — neutral, not punitive
  return ((score - CEILING_MIN) / (CEILING_MAX - CEILING_MIN)) * 100;
}

/** ArchetypeEV roughly spans [-0.5, 1.0]; map to 0–100. */
export function normaliseArchetypeEv(ev: number): number {
  const min = -0.5;
  const max = 1.0;
  return Math.max(0, Math.min(100, ((ev - min) / (max - min)) * 100));
}

/** ValueScore already [-100, 100] → [0, 100]. */
export function normaliseValue(score: number): number {
  return (score + 100) / 2;
}

export function computeDraftScore(
  ceiling: CeilingResult,
  archetype: ArchetypeResult,
  risk: RiskResult,
  value: ValueResult,
  weights: DraftScoreWeights = DEFAULT_WEIGHTS,
): number {
  // For provisional RB (no ceiling), redistribute ceiling weight into archetype + risk.
  let w = { ...weights };
  if (ceiling.provisional || ceiling.ceilingScore == null) {
    const freed = w.ceiling;
    w = {
      ceiling: 0,
      archetype: w.archetype + freed * 0.6,
      value: w.value,
      risk: w.risk + freed * 0.4,
    };
  }

  const total = w.ceiling + w.archetype + w.value + w.risk;
  const score =
    (w.ceiling / total) * normaliseCeiling(ceiling.ceilingScore) +
    (w.archetype / total) * normaliseArchetypeEv(archetype.archetypeEv) +
    (w.value / total) * normaliseValue(value.valueScore) +
    (w.risk / total) * (100 - risk.riskProfile);

  return Math.round(score * 10) / 10;
}

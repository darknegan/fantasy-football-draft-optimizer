import type {
  CalibrationProposal,
  DraftOutcome,
  DraftScoreWeights,
  GradingBands,
} from '@draftlab/domain';
import { followRate, meanRankDelta } from './outcomes.js';

export const DEFAULT_BANDS: GradingBands = {
  eliteMin: 1.15,
  greenMin: 1.05,
  yellowMin: 0.9,
  orangeMin: 0.75,
  redMin: 0.5,
};

export const DEFAULT_WEIGHTS: DraftScoreWeights = {
  ceiling: 0.4,
  archetype: 0.25,
  value: 0.2,
  risk: 0.15,
};

/**
 * Propose band / weight tweaks from observed follow rate and rank deltas.
 * Conservative nudges only — full season validation still required before trusting production.
 */
export function proposeCalibration(
  outcomes: DraftOutcome[],
  currentBands: GradingBands = DEFAULT_BANDS,
  currentWeights: DraftScoreWeights = DEFAULT_WEIGHTS,
): CalibrationProposal {
  const sampleSize = outcomes.length;
  const rate = followRate(outcomes);
  const delta = meanRankDelta(outcomes);
  const notes: string[] = [];

  let bands = { ...currentBands };
  let weights = { ...currentWeights };

  if (sampleSize < 8) {
    notes.push('Sample too small for a confident recalibration — need more recorded picks.');
  } else {
    // If users consistently pick lower-ranked players, value/risk may be overweighted vs ceiling.
    if (delta > 2.5) {
      weights = {
        ceiling: clamp(weights.ceiling + 0.04, 0.2, 0.55),
        archetype: clamp(weights.archetype + 0.02, 0.1, 0.4),
        value: clamp(weights.value - 0.03, 0.05, 0.35),
        risk: clamp(weights.risk - 0.03, 0.05, 0.3),
      };
      notes.push('Mean rank delta is high — proposing more weight on ceiling/archetype.');
    } else if (delta < 0.75 && rate > 0.55) {
      notes.push('Model and picks are well aligned — minor band tightening only.');
      bands = {
        eliteMin: currentBands.eliteMin,
        greenMin: round3(currentBands.greenMin - 0.01),
        yellowMin: round3(currentBands.yellowMin - 0.01),
        orangeMin: round3(currentBands.orangeMin - 0.01),
        redMin: currentBands.redMin,
      };
    }

    if (rate < 0.35) {
      bands = {
        eliteMin: currentBands.eliteMin,
        greenMin: round3(currentBands.greenMin + 0.02),
        yellowMin: round3(currentBands.yellowMin + 0.01),
        orangeMin: currentBands.orangeMin,
        redMin: currentBands.redMin,
      };
      notes.push('Low follow rate — proposing stricter green band so elite grades are rarer.');
    }
  }

  // Renormalise weights to sum ≈ 1
  const sum = weights.ceiling + weights.archetype + weights.value + weights.risk;
  weights = {
    ceiling: round3(weights.ceiling / sum),
    archetype: round3(weights.archetype / sum),
    value: round3(weights.value / sum),
    risk: round3(weights.risk / sum),
  };

  const version = `cal-${new Date().toISOString().slice(0, 10)}-n${sampleSize}`;

  return {
    version,
    sampleSize,
    followRate: rate,
    meanRankDelta: delta,
    proposedBands: bands,
    proposedWeights: weights,
    currentBands,
    currentWeights,
    notes,
    applied: false,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

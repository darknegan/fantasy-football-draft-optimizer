import type { ArchetypeId, MultiYearCurve, Player, PlayerEvaluation, Position } from '@draftlab/domain';

/** Position peak-age centers used for multi-year decay/growth. */
const PEAK_AGE: Record<Position, number> = {
  QB: 28,
  RB: 24,
  WR: 26,
  TE: 27,
};

/** How quickly value falls after the peak (per year). */
const POST_PEAK_DECAY: Record<Position, number> = {
  QB: 0.06,
  RB: 0.18,
  WR: 0.1,
  TE: 0.09,
};

/** Pre-peak growth rate toward peak. */
const PRE_PEAK_GROWTH: Record<Position, number> = {
  QB: 0.08,
  RB: 0.12,
  WR: 0.1,
  TE: 0.09,
};

const ARCHETYPE_ASSET_BIAS: Record<ArchetypeId, number> = {
  BREAKOUT_CANDIDATE: 1.15,
  // Interim estimate (de-risked vs. an unproven breakout, but not yet an established
  // IN_THEIR_PRIME asset) — no dedicated dynasty study for this split yet.
  PROVEN_BREAKOUT_CANDIDATE: 1.18,
  IN_THEIR_PRIME: 1.05,
  PRIME_WR1: 1.12,
  PRIME_WR2: 1.05,
  TRUSTY_VETERAN: 0.78,
};

const DISCOUNT = 0.92;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Build a 5-year value curve from current DraftScore, age, position, and archetype.
 * Year 0 is current-season production; later years tilt toward asset value.
 */
export function buildMultiYearCurve(
  player: Player,
  evaluation: PlayerEvaluation,
  season: number,
  years = 5,
): MultiYearCurve {
  const base = evaluation.draftScore;
  const peak = PEAK_AGE[player.position];
  const archetype = evaluation.archetype.archetype;
  const assetBias = ARCHETYPE_ASSET_BIAS[archetype] ?? 1;

  const points = [];
  for (let y = 0; y < years; y++) {
    const age = player.age + y;
    let multiplier = 1;
    if (age < peak) {
      // Young players grow into peak rather than already being above it.
      const yearsToPeak = peak - age;
      multiplier = 1 - yearsToPeak * PRE_PEAK_GROWTH[player.position] * 0.4;
      multiplier = clamp(multiplier, 0.55, 1.05);
    } else if (age > peak) {
      const yearsPast = age - peak;
      multiplier = 1 - yearsPast * POST_PEAK_DECAY[player.position];
      multiplier = clamp(multiplier, 0.2, 1);
    }

    // Breakout candidates keep upside longer; trusty vets decay faster as assets.
    const adjusted = base * multiplier * (y === 0 ? 1 : assetBias);
    const productionWeight = clamp(1 - y * 0.15, 0.25, 1);
    const assetWeight = clamp(0.35 + y * 0.12, 0.35, 0.95);
    const value = Math.round(adjusted * (0.55 * productionWeight + 0.45 * assetWeight) * 10) / 10;

    points.push({
      yearOffset: y,
      season: season + y,
      value,
      productionWeight: Math.round(productionWeight * 100) / 100,
      assetWeight: Math.round(assetWeight * 100) / 100,
    });
  }

  let npv = 0;
  let peakYearOffset = 0;
  let peakVal = -Infinity;
  for (const p of points) {
    npv += p.value * Math.pow(DISCOUNT, p.yearOffset);
    if (p.value > peakVal) {
      peakVal = p.value;
      peakYearOffset = p.yearOffset;
    }
  }
  npv = Math.round(npv * 10) / 10;

  // Contend window: consecutive years with value >= 70% of peak.
  const threshold = peakVal * 0.7;
  let start: number | null = null;
  let end: number | null = null;
  for (const p of points) {
    if (p.value >= threshold) {
      if (start == null) start = p.yearOffset;
      end = p.yearOffset;
    } else if (start != null) {
      break;
    }
  }

  return {
    playerId: player.id,
    points,
    npv,
    peakYearOffset,
    contendWindow: start != null && end != null ? { start, end } : null,
  };
}

/** Blend current-season draft score with NPV for dynasty ranking. */
export function dynastyCompositeScore(
  draftScore: number,
  npv: number,
  mode: 'contend' | 'rebuild' | 'neutral',
): number {
  const weights =
    mode === 'contend'
      ? { current: 0.7, npv: 0.3 }
      : mode === 'rebuild'
        ? { current: 0.25, npv: 0.75 }
        : { current: 0.45, npv: 0.55 };
  // NPV is sum of discounted years; normalise roughly to draftScore scale.
  const npvNorm = npv / 3.5;
  return Math.round((weights.current * draftScore + weights.npv * npvNorm) * 10) / 10;
}

import type { Player, RiskResult } from '@draftlab/domain';
import type { ArchetypeResult } from '@draftlab/domain';

/** Eleven-year top-20 RB average games missed — used as prior. */
export const RB_AVG_GAMES_MISSED = 2.86;
export const RB_SERIOUS_INJURY_RATE = 0.19;

function ageCurvePenalty(player: Player): number {
  const { position, age } = player;
  switch (position) {
    case 'RB':
      if (age >= 28) return Math.min(1, 0.4 + (age - 28) * 0.15);
      if (age >= 26) return 0.2 + (age - 26) * 0.1;
      return 0;
    case 'WR':
      // WR penalty ramps earlier/harder than folklore — see §2.2.
      if (age >= 30) return Math.min(1, 0.5 + (age - 30) * 0.15);
      if (age >= 28) return 0.25 + (age - 28) * 0.125;
      return 0;
    case 'TE':
      if (age >= 32) return Math.min(1, 0.4 + (age - 32) * 0.12);
      if (age >= 30) return 0.2 + (age - 30) * 0.1;
      return 0;
    case 'QB':
      if (age >= 36) return Math.min(1, 0.35 + (age - 36) * 0.1);
      if (age >= 34) return 0.15 + (age - 34) * 0.1;
      return 0;
    default:
      return 0;
  }
}

export interface RiskInput {
  careerGamesMissedRate?: number; // 0–1 fraction of games missed career
  recentSeriousInjury?: boolean;
  expectedGamesMissedOverride?: number;
}

export function evaluateRisk(player: Player, archetype: ArchetypeResult, input: RiskInput = {}): RiskResult {
  const careerMissed = clamp01(input.careerGamesMissedRate ?? (player.position === 'RB' ? RB_AVG_GAMES_MISSED / 17 : 0.1));
  const archetypeInjury = clamp01(archetype.rates.injuryRate);
  const agePenalty = clamp01(ageCurvePenalty(player));
  const serious = input.recentSeriousInjury ? 1 : 0;

  const riskProfile = 100 * (0.4 * careerMissed + 0.25 * archetypeInjury + 0.2 * agePenalty + 0.15 * serious);

  const expectedGamesMissed =
    input.expectedGamesMissedOverride ??
    (player.position === 'RB' ? RB_AVG_GAMES_MISSED : careerMissed * 17);

  return {
    riskProfile: round2(riskProfile),
    expectedGamesMissed: round2(expectedGamesMissed),
    components: {
      careerMissedRate: careerMissed,
      archetypeInjury,
      ageCurvePenalty: agePenalty,
      recentSeriousInjury: serious,
    },
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

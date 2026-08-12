import type {
  ArchetypeId,
  ArchetypeRates,
  ArchetypeResult,
  FactorInput,
  Player,
  Position,
} from '@draftlab/domain';

const RB_RATES: Record<
  | 'BREAKOUT_CANDIDATE'
  | 'PROVEN_BREAKOUT_CANDIDATE'
  | 'ELITE'
  | 'IN_THEIR_PRIME'
  | 'TRUSTY_VETERAN',
  ArchetypeRates
> = {
  BREAKOUT_CANDIDATE: {
    returnRate: 0.4286,
    injuryRate: 0.1786,
    boomRate: 0.1964,
    bustRate: 0.1964,
    fineRate: 0.1964,
  },
  TRUSTY_VETERAN: {
    returnRate: 0.3333,
    injuryRate: 0.2167,
    boomRate: 0.2,
    bustRate: 0.1667,
    fineRate: 0.2833,
  },
  // Provisional: reuse the former undifferentiated prime rates until a dedicated study.
  ELITE: {
    returnRate: 0.4615,
    injuryRate: 0.1538,
    boomRate: 0.2788,
    bustRate: 0.2019,
    fineRate: 0.1827,
  },
  IN_THEIR_PRIME: {
    returnRate: 0.4615,
    injuryRate: 0.1538,
    boomRate: 0.2788,
    bustRate: 0.2019,
    fineRate: 0.1827,
  },
  // No dedicated historical study yet for this sub-population — reuse BREAKOUT_CANDIDATE's
  // empirical rates as an interim stand-in rather than falling through to NEUTRAL_RATES.
  PROVEN_BREAKOUT_CANDIDATE: {
    returnRate: 0.4286,
    injuryRate: 0.1786,
    boomRate: 0.1964,
    bustRate: 0.1964,
    fineRate: 0.1964,
  },
};

const WR_RATES: Record<
  | 'BREAKOUT_CANDIDATE'
  | 'PROVEN_BREAKOUT_CANDIDATE'
  | 'ELITE'
  | 'IN_THEIR_PRIME'
  | 'TRUSTY_VETERAN',
  ArchetypeRates
> = {
  BREAKOUT_CANDIDATE: {
    returnRate: 0.2727,
    injuryRate: 0.1591,
    boomRate: 0.1818,
    bustRate: 0.2955,
    fineRate: 0.2727,
  },
  TRUSTY_VETERAN: {
    returnRate: 0.2778,
    injuryRate: 0.3056,
    boomRate: 0.0833,
    bustRate: 0.1667,
    fineRate: 0.25,
  },
  // Provisional: reuse the former PRIME_WR1 rates until a dedicated study.
  ELITE: {
    returnRate: 0.5352,
    injuryRate: 0.1127,
    boomRate: 0.338,
    bustRate: 0.1268,
    fineRate: 0.2254,
  },
  // Provisional: reuse the former PRIME_WR2 rates until a dedicated study.
  IN_THEIR_PRIME: {
    returnRate: 0.379,
    injuryRate: 0.138,
    boomRate: 0.31,
    bustRate: 0.31,
    fineRate: 0.172,
  },
  // Provisional: proven candidates reuse the breakout rates.
  PROVEN_BREAKOUT_CANDIDATE: {
    returnRate: 0.2727,
    injuryRate: 0.1591,
    boomRate: 0.1818,
    bustRate: 0.2955,
    fineRate: 0.2727,
  },
};

/** Neutral rates for QB/TE until position-specific studies land. */
const NEUTRAL_RATES: ArchetypeRates = {
  returnRate: 0.4,
  injuryRate: 0.15,
  boomRate: 0.22,
  bustRate: 0.2,
  fineRate: 0.23,
};

export function computeArchetypeEv(rates: ArchetypeRates): number {
  return (
    2 * rates.boomRate +
    1 * rates.returnRate +
    0 * rates.fineRate -
    1 * rates.bustRate -
    1.5 * rates.injuryRate
  );
}

/** Finish count strictly greater than half of seasons in league (e.g. 8 yrs → ≥5). */
export function overHalf(finishCount: number, seasonsInLeague: number): boolean {
  return finishCount > seasonsInLeague / 2;
}

function classifySkillPosition(player: Player): ArchetypeId {
  const top5 = player.positionalTop5FinishCount ?? 0;
  const top8 = player.positionalTop8FinishCount ?? 0;
  const top12 = player.positionalTop12FinishCount ?? 0;
  const seasons = player.seasonsInLeague;

  if (seasons <= 3 && top5 === 0) return 'BREAKOUT_CANDIDATE';
  if (seasons <= 3 && top5 === 1) return 'PROVEN_BREAKOUT_CANDIDATE';
  if (seasons <= 4 && top5 >= 2) return 'ELITE';
  if (seasons > 4 && overHalf(top8, seasons)) return 'ELITE';
  if (seasons > 4 && overHalf(top12, seasons)) return 'TRUSTY_VETERAN';
  if (seasons >= 7 || player.age >= 28) return 'VETERAN';
  return 'IN_THEIR_PRIME';
}

export function classifyRb(player: Player): ArchetypeId {
  return classifySkillPosition(player);
}

export function classifyWr(player: Player): ArchetypeId {
  return classifySkillPosition(player);
}

export function classifyTe(player: Player): ArchetypeId {
  return classifySkillPosition(player);
}

export function classifyQb(player: Player): ArchetypeId {
  const top5 = player.positionalTop5FinishCount ?? 0;
  const top8 = player.positionalTop8FinishCount ?? 0;
  const top12 = player.positionalTop12FinishCount ?? 0;
  const seasons = player.seasonsInLeague;

  if (seasons <= 3 && top5 === 0) return 'BREAKOUT_CANDIDATE';
  if (seasons <= 3 && top5 === 1) return 'PROVEN_BREAKOUT_CANDIDATE';
  if (seasons <= 4 && top5 >= 2) return 'ELITE';
  if (seasons > 4 && overHalf(top8, seasons)) return 'ELITE';
  if (seasons > 4 && overHalf(top12, seasons)) return 'TRUSTY_VETERAN';
  if (player.age >= 34) return 'VETERAN';
  return 'IN_THEIR_PRIME';
}

export function classifyArchetype(player: Player): ArchetypeId {
  switch (player.position) {
    case 'RB':
      return classifyRb(player);
    case 'WR':
      return classifyWr(player);
    case 'TE':
      return classifyTe(player);
    case 'QB':
      return classifyQb(player);
  }
}

function explainSkillPosition(player: Player): string {
  const top5 = player.positionalTop5FinishCount ?? 0;
  const top8 = player.positionalTop8FinishCount ?? 0;
  const top12 = player.positionalTop12FinishCount ?? 0;
  const seasons = player.seasonsInLeague;

  if (seasons <= 3 && top5 === 0) {
    return `yr ${seasons}, no top-5 finishes → rule 1`;
  }
  if (seasons <= 3 && top5 === 1) {
    return `yr ${seasons}, 1 top-5 finish → rule 2`;
  }
  if (seasons <= 4 && top5 >= 2) {
    return `yr ${seasons}, ${top5} top-5 finishes → rule 3`;
  }
  if (seasons > 4 && overHalf(top8, seasons)) {
    return `yr ${seasons}, top-8 in ${top8}/${seasons} seasons (over half) → rule 4`;
  }
  if (seasons > 4 && overHalf(top12, seasons)) {
    return `yr ${seasons}, top-12 in ${top12}/${seasons} seasons (over half) → rule 5`;
  }
  if (seasons >= 7 || player.age >= 28) {
    const gates: string[] = [];
    if (player.age >= 28) gates.push(`age ${player.age}`);
    if (seasons >= 7) gates.push(`yr ${seasons}`);
    return `${gates.join(', ')} — aging without half-rate pedigree → rule 6`;
  }
  return `yr ${seasons}, mid-career without half-rate pedigree → rule 7`;
}

function explainQb(player: Player): string {
  const top5 = player.positionalTop5FinishCount ?? 0;
  const top8 = player.positionalTop8FinishCount ?? 0;
  const top12 = player.positionalTop12FinishCount ?? 0;
  const seasons = player.seasonsInLeague;

  if (seasons <= 3 && top5 === 0) {
    return `yr ${seasons}, no top-5 finishes → rule 1`;
  }
  if (seasons <= 3 && top5 === 1) {
    return `yr ${seasons}, 1 top-5 finish → rule 2`;
  }
  if (seasons <= 4 && top5 >= 2) {
    return `yr ${seasons}, ${top5} top-5 finishes → rule 3`;
  }
  if (seasons > 4 && overHalf(top8, seasons)) {
    return `yr ${seasons}, top-8 in ${top8}/${seasons} seasons (over half) → rule 4`;
  }
  if (seasons > 4 && overHalf(top12, seasons)) {
    return `yr ${seasons}, top-12 in ${top12}/${seasons} seasons (over half) → rule 5`;
  }
  if (player.age >= 34) {
    return `age ${player.age} — aging without half-rate pedigree → rule 6`;
  }
  return `yr ${seasons}, mid-career without half-rate pedigree → rule 7`;
}

/** Short "Why" phrase for board tooltips — mirrors classifyArchetype ladder rules. */
export function explainArchetype(player: Player): string {
  if (player.position === 'QB') {
    return explainQb(player);
  }
  return explainSkillPosition(player);
}

function ratesFor(position: Position, archetype: ArchetypeId): ArchetypeRates {
  if (position === 'RB' && archetype in RB_RATES) {
    return RB_RATES[archetype as keyof typeof RB_RATES];
  }
  if (position === 'WR' && archetype in WR_RATES) {
    return WR_RATES[archetype as keyof typeof WR_RATES];
  }
  if (archetype === 'VETERAN') {
    const trusty =
      position === 'RB'
        ? RB_RATES.TRUSTY_VETERAN
        : position === 'WR'
          ? WR_RATES.TRUSTY_VETERAN
          : NEUTRAL_RATES;
    return {
      ...trusty,
      injuryRate: Math.min(1, trusty.injuryRate + 0.05),
      boomRate: Math.max(0, trusty.boomRate - 0.05),
    };
  }
  return NEUTRAL_RATES;
}

export function evaluateArchetype(player: Player, _factors: FactorInput[] = []): ArchetypeResult {
  const archetype = classifyArchetype(player);
  const rates = ratesFor(player.position, archetype);
  return {
    archetype,
    rates,
    archetypeEv: computeArchetypeEv(rates),
  };
}

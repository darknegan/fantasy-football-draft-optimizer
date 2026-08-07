import type { ArchetypeId, ArchetypeRates, ArchetypeResult, Player, Position } from '@draftlab/domain';

const RB_RATES: Record<'BREAKOUT_CANDIDATE' | 'TRUSTY_VETERAN' | 'IN_THEIR_PRIME', ArchetypeRates> = {
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
  IN_THEIR_PRIME: {
    returnRate: 0.4615,
    injuryRate: 0.1538,
    boomRate: 0.2788,
    bustRate: 0.2019,
    fineRate: 0.1827,
  },
};

const WR_RATES: Record<'BREAKOUT_CANDIDATE' | 'TRUSTY_VETERAN' | 'PRIME_WR1' | 'PRIME_WR2', ArchetypeRates> = {
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
  PRIME_WR1: {
    returnRate: 0.5352,
    injuryRate: 0.1127,
    boomRate: 0.338,
    bustRate: 0.1268,
    fineRate: 0.2254,
  },
  PRIME_WR2: {
    returnRate: 0.379,
    injuryRate: 0.138,
    boomRate: 0.31,
    bustRate: 0.31,
    fineRate: 0.172,
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
  return 2 * rates.boomRate + 1 * rates.returnRate + 0 * rates.fineRate - 1 * rates.bustRate - 1.5 * rates.injuryRate;
}

export function classifyRb(player: Player): ArchetypeId {
  if (player.seasonsInLeague <= 3 && !player.hasPositionalTop12Finish) return 'BREAKOUT_CANDIDATE';
  if (player.seasonsInLeague >= 7 || player.age >= 27) return 'TRUSTY_VETERAN';
  return 'IN_THEIR_PRIME';
}

export function classifyWr(player: Player): ArchetypeId {
  if (player.seasonsInLeague <= 3 && !player.hasPositionalTop12Finish) return 'BREAKOUT_CANDIDATE';
  if (player.seasonsInLeague >= 7 || player.age >= 28) return 'TRUSTY_VETERAN';
  return player.isClearWr1 ? 'PRIME_WR1' : 'PRIME_WR2';
}

export function classifyTe(player: Player): ArchetypeId {
  if (player.seasonsInLeague <= 3 && !player.hasPositionalTop12Finish) return 'BREAKOUT_CANDIDATE';
  if (player.seasonsInLeague >= 8 || player.age >= 30) return 'TRUSTY_VETERAN';
  return 'IN_THEIR_PRIME';
}

export function classifyQb(player: Player): ArchetypeId {
  if (player.seasonsInLeague <= 3 && !player.hasPositionalTop12Finish) return 'BREAKOUT_CANDIDATE';
  if (player.age >= 34) return 'TRUSTY_VETERAN';
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

function ratesFor(position: Position, archetype: ArchetypeId): ArchetypeRates {
  if (position === 'RB' && archetype in RB_RATES) {
    return RB_RATES[archetype as keyof typeof RB_RATES];
  }
  if (position === 'WR' && archetype in WR_RATES) {
    return WR_RATES[archetype as keyof typeof WR_RATES];
  }
  return NEUTRAL_RATES;
}

export function evaluateArchetype(player: Player): ArchetypeResult {
  const archetype = classifyArchetype(player);
  const rates = ratesFor(player.position, archetype);
  return {
    archetype,
    rates,
    archetypeEv: computeArchetypeEv(rates),
  };
}

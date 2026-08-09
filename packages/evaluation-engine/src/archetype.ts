import type {
  ArchetypeId,
  ArchetypeRates,
  ArchetypeResult,
  FactorInput,
  Player,
  Position,
} from '@draftlab/domain';
import { getBenchmarkConfig } from './config/benchmarks.js';

const RB_RATES: Record<
  'BREAKOUT_CANDIDATE' | 'PROVEN_BREAKOUT_CANDIDATE' | 'TRUSTY_VETERAN' | 'PRIME_RB1' | 'PRIME_RB2',
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
  // No dedicated bell-cow-vs-committee historical study yet — both tiers reuse the old
  // undifferentiated IN_THEIR_PRIME rates as an interim stand-in (same pattern as
  // PROVEN_BREAKOUT_CANDIDATE below). The archetype LABEL is still real and useful —
  // team_position_rank distinguishes a true lead back from a committee piece — it's only
  // the numeric EV that doesn't yet reflect a measured difference between them.
  PRIME_RB1: {
    returnRate: 0.4615,
    injuryRate: 0.1538,
    boomRate: 0.2788,
    bustRate: 0.2019,
    fineRate: 0.1827,
  },
  PRIME_RB2: {
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
  'BREAKOUT_CANDIDATE' | 'TRUSTY_VETERAN' | 'PRIME_WR1' | 'PRIME_WR2',
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

const PRIMARY_VOLUME_FACTOR: Partial<Record<Position, string>> = {
  WR: 'targets',
  RB: 'touches',
};

/**
 * How much of the WR1/RB1 "lead option" rates a player earns, scaled by their own primary
 * volume (targets/g for WR, touches/g for RB) against the position's real benchmark.
 * teamPositionRank === 1 only means "biggest share on his own roster" — it says nothing
 * about how big that share is. A low-volume leading receiver on a run-heavy offense (e.g.
 * Khalil Shakir: team's #1 WR by target share, but well under the WR benchmark) shouldn't
 * get the same elite-alpha boom/bust profile as a true target hog just for edging out
 * weaker teammates. At/above benchmark: full WR1/RB1 credit. Below it: blend down toward
 * WR2/RB2. No signal (factor missing): keep the old flat full-credit behavior.
 */
function volumeRatio(position: Position, factors: FactorInput[]): number {
  const factorId = PRIMARY_VOLUME_FACTOR[position];
  if (!factorId) return 1;
  const value = factors.find((f) => f.factorId === factorId)?.value;
  if (value == null) return 1;
  const benchmark = getBenchmarkConfig(position).factors.find((f) => f.id === factorId)?.benchmark;
  if (!benchmark) return 1;
  return Math.max(0, Math.min(1, value / benchmark));
}

function blendRates(low: ArchetypeRates, high: ArchetypeRates, t: number): ArchetypeRates {
  return {
    returnRate: low.returnRate + t * (high.returnRate - low.returnRate),
    injuryRate: low.injuryRate + t * (high.injuryRate - low.injuryRate),
    boomRate: low.boomRate + t * (high.boomRate - low.boomRate),
    bustRate: low.bustRate + t * (high.bustRate - low.bustRate),
    fineRate: low.fineRate + t * (high.fineRate - low.fineRate),
  };
}

export function computeArchetypeEv(rates: ArchetypeRates): number {
  return (
    2 * rates.boomRate +
    1 * rates.returnRate +
    0 * rates.fineRate -
    1 * rates.bustRate -
    1.5 * rates.injuryRate
  );
}

export function classifyRb(player: Player): ArchetypeId {
  if (player.seasonsInLeague <= 3) {
    const finishCount = player.positionalTop12FinishCount;
    if (finishCount === undefined) {
      // No count on record — fall back to the boolean's coarse split (unchanged legacy
      // behavior). true-with-no-count is treated as already established, same as before.
      if (!player.hasPositionalTop12Finish) return 'BREAKOUT_CANDIDATE';
    } else if (finishCount === 0) {
      return 'BREAKOUT_CANDIDATE';
    } else if (finishCount === 1) {
      return 'PROVEN_BREAKOUT_CANDIDATE';
    }
    // finishCount >= 2 falls through — already entrenched, not a breakout.
  }
  if (player.seasonsInLeague >= 7 || player.age >= 27) return 'TRUSTY_VETERAN';
  return player.teamPositionRank === 1 ? 'PRIME_RB1' : 'PRIME_RB2';
}

export function classifyWr(player: Player): ArchetypeId {
  if (player.seasonsInLeague <= 3 && !player.hasPositionalTop12Finish) return 'BREAKOUT_CANDIDATE';
  if (player.seasonsInLeague >= 7 || player.age >= 28) return 'TRUSTY_VETERAN';
  return player.teamPositionRank === 1 ? 'PRIME_WR1' : 'PRIME_WR2';
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

function ratesFor(
  position: Position,
  archetype: ArchetypeId,
  factors: FactorInput[],
): ArchetypeRates {
  if (position === 'RB' && archetype === 'PRIME_RB1') {
    return blendRates(RB_RATES.PRIME_RB2, RB_RATES.PRIME_RB1, volumeRatio(position, factors));
  }
  if (position === 'WR' && archetype === 'PRIME_WR1') {
    return blendRates(WR_RATES.PRIME_WR2, WR_RATES.PRIME_WR1, volumeRatio(position, factors));
  }
  if (position === 'RB' && archetype in RB_RATES) {
    return RB_RATES[archetype as keyof typeof RB_RATES];
  }
  if (position === 'WR' && archetype in WR_RATES) {
    return WR_RATES[archetype as keyof typeof WR_RATES];
  }
  return NEUTRAL_RATES;
}

export function evaluateArchetype(player: Player, factors: FactorInput[] = []): ArchetypeResult {
  const archetype = classifyArchetype(player);
  const rates = ratesFor(player.position, archetype, factors);
  return {
    archetype,
    rates,
    archetypeEv: computeArchetypeEv(rates),
  };
}

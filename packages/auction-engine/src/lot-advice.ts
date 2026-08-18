import type { Position, StrategyId } from '@draftlab/domain';
import { classifyFit, getRoundTarget, getStrategy } from '@draftlab/strategy-engine';

export type AuctionLotVerdict = 'take' | 'pass';

export interface AuctionLotAdvice {
  verdict: AuctionLotVerdict;
  headline: string;
  reason: string;
}

export interface AuctionLotAdviceInput {
  strategyId?: string;
  position: Position;
  playerName: string;
  fairValue: number;
  inflatedValue: number;
  ceilingValue: number;
  signed: Array<{ position: Position }>;
  remainingBudget: number;
  slotsLeft: number;
  roster: {
    qb: number;
    rb: number;
    wr: number;
    te: number;
    flex: number;
    superflex: number;
  };
}

const STRATEGY_IDS: readonly StrategyId[] = [
  'balanced',
  'hero_rb',
  'hero_wr',
  'double_hero_rb',
  'double_hero_wr',
  'robust_rb',
  'zero_rb',
  'elite_qb',
  'elite_te',
];

function asStrategyId(id: string | undefined): StrategyId {
  return STRATEGY_IDS.includes(id as StrategyId) ? (id as StrategyId) : 'balanced';
}

function auctionRound(signedCount: number): number {
  return Math.min(17, Math.max(1, signedCount + 1));
}

function starterNeed(
  position: Position,
  signed: Array<{ position: Position }>,
  roster: AuctionLotAdviceInput['roster'],
): { filled: number; required: number; open: number } {
  const filled = signed.filter((p) => p.position === position).length;
  const required =
    position === 'QB'
      ? roster.qb + roster.superflex
      : position === 'RB'
        ? roster.rb
        : position === 'WR'
          ? roster.wr
          : roster.te;
  return { filled, required, open: Math.max(0, required - filled) };
}

function affordableMax(remainingBudget: number, slotsLeft: number): number {
  return Math.max(1, remainingBudget - Math.max(0, slotsLeft - 1));
}

/**
 * Take / pass copy for the nominated player: strategy fit at this auction
 * "round" (roster spots already filled + 1), price vs fair/ceiling, and
 * whether the user's current roster still needs the position.
 */
export function recommendAuctionLot(input: AuctionLotAdviceInput): AuctionLotAdvice {
  const strategyId = asStrategyId(input.strategyId);
  const strategy = getStrategy(strategyId) ?? getStrategy('balanced');
  const round = auctionRound(input.signed.length);
  const target = getRoundTarget(strategyId, round);
  const fit = classifyFit(strategyId, round, input.position);
  const need = starterNeed(input.position, input.signed, input.roster);
  const price = input.inflatedValue;
  const maxAffordable = affordableMax(input.remainingBudget, input.slotsLeft);
  const overpay = price > input.fairValue * 1.15;
  const atOrUnderFair = price <= input.fairValue;
  const unaffordable = price > maxAffordable;
  const aboveCeiling = price > input.ceilingValue;

  let score = 0;
  if (fit === 'primary') score += 2;
  else if (fit === 'secondary') score += 1;
  else if (fit === 'avoid') score -= 3;

  if (need.open > 0) score += need.filled === 0 ? 2 : 1;
  else score -= 1;

  if (unaffordable) score = -99;
  else if (aboveCeiling || overpay) score -= 1;
  else if (atOrUnderFair) score += 1;

  const verdict: AuctionLotVerdict = score >= 1 ? 'take' : 'pass';
  const headline = verdict === 'take' ? `Take ${input.playerName}` : `Pass on ${input.playerName}`;

  const bits: string[] = [];
  if (verdict === 'take') {
    if (fit === 'primary' && need.filled === 0) {
      bits.push(
        `${strategy.name} wants ${input.position} now (${target.note.replace(/\.$/, '')}) and you have none yet`,
      );
    } else if (need.open > 0) {
      bits.push(
        `you still need ${need.open} starting ${input.position}${need.open === 1 ? '' : 's'} for ${strategy.name}`,
      );
    } else {
      bits.push(`${input.position} still fits ${strategy.name} at this stage of the auction`);
    }
    if (atOrUnderFair) {
      bits.push(`$${price} sits on our fair value of $${input.fairValue}`);
    } else {
      bits.push(`$${price} is within the $${input.ceilingValue} pay-up-to`);
    }
  } else {
    if (unaffordable) {
      bits.push(
        `$${price} would leave less than $1 for each of the ${Math.max(0, input.slotsLeft - 1)} spots still open`,
      );
    } else if (fit === 'avoid') {
      bits.push(`${strategy.name} fades ${input.position} this early (${target.note.replace(/\.$/, '')})`);
    } else if (need.filled > 0 && fit !== 'primary') {
      const elsewhere = target.primary.filter((p) => p !== input.position).join('/');
      bits.push(
        `you already have ${need.filled} ${input.position}${need.filled === 1 ? '' : 's'} and ${strategy.name} would rather spend${elsewhere ? ` on ${elsewhere}` : ' elsewhere'}`,
      );
    } else if (need.open === 0) {
      bits.push(
        `you already have ${need.filled} ${input.position}${need.filled === 1 ? '' : 's'} and ${strategy.name} would rather spend elsewhere`,
      );
    } else {
      bits.push(`${strategy.name} can wait on ${input.position} here`);
    }
    if (!unaffordable && (overpay || aboveCeiling)) {
      bits.push(
        `$${price} is rich vs fair $${input.fairValue} (max $${input.ceilingValue})`,
      );
    }
  }

  return {
    verdict,
    headline,
    reason: `${bits.join(', ')}.`,
  };
}

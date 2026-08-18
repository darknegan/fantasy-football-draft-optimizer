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
  /** Remaining board used to price replacement starters. */
  available?: Array<{ position: Position; fairValue: number }>;
  /** When YOU are about to bid, the typed amount; otherwise omitted. */
  contemplatedPrice?: number;
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

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];
const REPLACEMENT_FLOOR = 5;

function asStrategyId(id: string | undefined): StrategyId {
  return STRATEGY_IDS.includes(id as StrategyId) ? (id as StrategyId) : 'balanced';
}

function auctionRound(signedCount: number): number {
  return Math.min(17, Math.max(1, signedCount + 1));
}

function requiredStarters(
  position: Position,
  roster: AuctionLotAdviceInput['roster'],
): number {
  if (position === 'QB') return roster.qb + roster.superflex;
  if (position === 'RB') return roster.rb;
  if (position === 'WR') return roster.wr;
  return roster.te;
}

function counts(signed: Array<{ position: Position }>): Record<Position, number> {
  const out: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of signed) out[p.position] += 1;
  return out;
}

function starterNeed(
  position: Position,
  filledCounts: Record<Position, number>,
  roster: AuctionLotAdviceInput['roster'],
): { filled: number; required: number; starterOpen: number } {
  const filled = filledCounts[position];
  const required = requiredStarters(position, roster);
  return { filled, required, starterOpen: Math.max(0, required - filled) };
}

function flexOpen(filledCounts: Record<Position, number>, roster: AuctionLotAdviceInput['roster']): number {
  const extra =
    Math.max(0, filledCounts.RB - roster.rb) +
    Math.max(0, filledCounts.WR - roster.wr) +
    Math.max(0, filledCounts.TE - roster.te);
  return Math.max(0, roster.flex - extra);
}

function applyTake(
  filledCounts: Record<Position, number>,
  position: Position,
): Record<Position, number> {
  const next = { ...filledCounts };
  next[position] += 1;
  return next;
}

function remainingStarterHoles(
  filledCounts: Record<Position, number>,
  roster: AuctionLotAdviceInput['roster'],
): Array<{ position: Position | 'FLEX'; count: number }> {
  const holes: Array<{ position: Position | 'FLEX'; count: number }> = [];
  for (const pos of POSITIONS) {
    const open = starterNeed(pos, filledCounts, roster).starterOpen;
    if (open > 0) holes.push({ position: pos, count: open });
  }
  const flex = flexOpen(filledCounts, roster);
  if (flex > 0) holes.push({ position: 'FLEX', count: flex });
  return holes;
}

function cheapestFair(
  available: Array<{ position: Position; fairValue: number }>,
  position: Position,
  used: boolean[],
): number | null {
  let best = -1;
  for (let i = 0; i < available.length; i++) {
    if (used[i]) continue;
    const row = available[i]!;
    if (row.position !== position) continue;
    if (best < 0 || row.fairValue < available[best]!.fairValue) best = i;
  }
  if (best < 0) return null;
  used[best] = true;
  return Math.max(REPLACEMENT_FLOOR, available[best]!.fairValue);
}

function cheapestFlex(
  available: Array<{ position: Position; fairValue: number }>,
  used: boolean[],
): number | null {
  let best = -1;
  for (let i = 0; i < available.length; i++) {
    if (used[i]) continue;
    const row = available[i]!;
    if (row.position === 'QB') continue;
    if (best < 0 || row.fairValue < available[best]!.fairValue) best = i;
  }
  if (best < 0) return null;
  used[best] = true;
  return Math.max(REPLACEMENT_FLOOR, available[best]!.fairValue);
}

function replacementReserve(
  holes: Array<{ position: Position | 'FLEX'; count: number }>,
  available: Array<{ position: Position; fairValue: number }>,
  leftoverSlots: number,
): { dollars: number; labels: string[] } {
  const used = available.map(() => false);
  let dollars = 0;
  const labels: string[] = [];
  let starterSlots = 0;
  for (const hole of holes) {
    starterSlots += hole.count;
    for (let n = 0; n < hole.count; n++) {
      const cost =
        hole.position === 'FLEX'
          ? cheapestFlex(available, used)
          : cheapestFair(available, hole.position, used);
      dollars += cost ?? REPLACEMENT_FLOOR;
    }
    if (hole.position !== 'FLEX') labels.push(hole.position);
    else labels.push('flex');
  }
  const bench = Math.max(0, leftoverSlots - starterSlots);
  dollars += bench;
  return { dollars, labels };
}

/**
 * Take / pass for the nominated player. Leftover budget and remaining
 * starter holes decide first; strategy fit is only a modifier.
 */
export function recommendAuctionLot(input: AuctionLotAdviceInput): AuctionLotAdvice {
  const strategyId = asStrategyId(input.strategyId);
  const strategy = getStrategy(strategyId) ?? getStrategy('balanced');
  const round = auctionRound(input.signed.length);
  const target = getRoundTarget(strategyId, round);
  const fit = classifyFit(strategyId, round, input.position);
  const filledCounts = counts(input.signed);
  const need = starterNeed(input.position, filledCounts, input.roster);
  const price = Math.max(1, Math.round(input.contemplatedPrice ?? input.inflatedValue));
  const leftover = input.remainingBudget - price;
  const stubNeed = Math.max(0, input.slotsLeft - 1);
  const overpay = price > input.fairValue * 1.15;
  const atOrUnderFair = price <= input.fairValue;
  const bargain = price <= input.fairValue * 0.85;
  const aboveCeiling = price > input.ceilingValue;
  const available = input.available ?? [];

  const afterCounts = applyTake(filledCounts, input.position);
  const holesAfter = remainingStarterHoles(afterCounts, input.roster);
  const reserve = replacementReserve(holesAfter, available, stubNeed);
  const cannotBuy = price > input.remainingBudget;
  const cannotStub = leftover < stubNeed;
  const cannotReserve = leftover < reserve.dollars;
  const fillsStarter = need.starterOpen > 0;

  let verdict: AuctionLotVerdict = 'take';
  let passKind:
    | 'cannot_buy'
    | 'stubs'
    | 'reserve'
    | 'avoid'
    | 'no_need'
    | 'wait'
    | null = null;

  if (cannotBuy) {
    verdict = 'pass';
    passKind = 'cannot_buy';
  } else if (cannotStub) {
    verdict = 'pass';
    passKind = 'stubs';
  } else if (cannotReserve) {
    verdict = 'pass';
    passKind = 'reserve';
  } else if (fit === 'avoid' && !bargain) {
    verdict = 'pass';
    passKind = 'avoid';
  } else if (!fillsStarter && !bargain) {
    verdict = 'pass';
    passKind = 'no_need';
  } else if (need.filled > 0 && fit !== 'primary' && !bargain) {
    verdict = 'pass';
    passKind = 'no_need';
  } else if (fillsStarter || bargain) {
    verdict = 'take';
  } else {
    verdict = 'pass';
    passKind = 'wait';
  }

  const headline = verdict === 'take' ? `Take ${input.playerName}` : `Pass on ${input.playerName}`;
  const holeLabels = [...new Set(reserve.labels.filter((l) => l !== 'flex'))];
  const bits: string[] = [];

  if (verdict === 'pass') {
    if (passKind === 'cannot_buy') {
      bits.push(`you only have $${input.remainingBudget} left`);
    } else if (passKind === 'stubs') {
      bits.push(
        `you have $${input.remainingBudget} left and $${price} would leave less than $1 for each of the ${stubNeed} spots still open`,
      );
      if (holeLabels.length) bits.push(`you still need ${holeLabels.join('/')}`);
    } else if (passKind === 'reserve') {
      const needBit = holeLabels.length ? holeLabels.join('/') : 'remaining starters';
      bits.push(
        `taking him at $${price} leaves $${Math.max(0, leftover)}, not enough to fill remaining ${needBit}`,
      );
    } else if (passKind === 'avoid') {
      bits.push(`${strategy.name} fades ${input.position} this early (${target.note.replace(/\.$/, '')})`);
    } else if (passKind === 'no_need') {
      bits.push(
        `you already have ${need.filled} ${input.position}${need.filled === 1 ? '' : 's'} and still need budget for ${holeLabels.join('/') || 'the rest of the roster'}`,
      );
    } else {
      bits.push(`${strategy.name} can wait on ${input.position} here`);
    }
    if (overpay || aboveCeiling) {
      bits.push(`$${price} is rich vs fair $${input.fairValue} (max $${input.ceilingValue})`);
    }
  } else {
    if (fillsStarter && need.filled === 0) {
      bits.push(
        `${strategy.name} still needs a ${input.position} and you have none yet`,
      );
    } else if (fillsStarter) {
      bits.push(
        `you still need ${need.starterOpen} starting ${input.position}${need.starterOpen === 1 ? '' : 's'} for ${strategy.name}`,
      );
    } else {
      bits.push(`$${price} is a discount vs fair $${input.fairValue} that still leaves roster money`);
    }
    if (atOrUnderFair) {
      bits.push(`$${price} sits on our fair value of $${input.fairValue}`);
    } else if (bargain) {
      bits.push(`$${price} is well under fair $${input.fairValue}`);
    } else {
      bits.push(`$${price} is within the $${input.ceilingValue} pay-up-to`);
    }
    bits.push(`leaving $${Math.max(0, leftover)} of $${input.remainingBudget}`);
  }

  return {
    verdict,
    headline,
    reason: `${bits.join(', ')}.`,
  };
}

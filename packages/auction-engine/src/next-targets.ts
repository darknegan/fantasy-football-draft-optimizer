import type { Position, StrategyId } from '@draftlab/domain';
import { classifyFit } from '@draftlab/strategy-engine';
import { recommendAuctionLot } from './lot-advice.js';

export interface AuctionNextPlayer {
  playerId: string;
  name: string;
  position: Position;
  inflatedValue: number;
  fairValue: number;
  draftScore: number;
}

export interface AuctionNextTargetInput {
  strategyId?: string;
  signed: Array<{ playerId?: string; position: Position; amount?: number }>;
  remainingBudget: number;
  slotsLeft: number;
  roster: {
    qb: number;
    rb: number;
    wr: number;
    te: number;
    flex: number;
    superflex: number;
    k?: number;
    def?: number;
  };
  available: Array<{
    playerId: string;
    name: string;
    position: Position;
    fairValue: number;
    inflatedValue: number;
    draftScore?: number;
    ceilingValue?: number | null;
  }>;
  limit?: number;
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

const EXPENSIVE_PIECE = 30;

function asStrategyId(id: string | undefined): StrategyId {
  return STRATEGY_IDS.includes(id as StrategyId) ? (id as StrategyId) : 'balanced';
}

function auctionRound(signedCount: number): number {
  return Math.min(17, Math.max(1, signedCount + 1));
}

function requiredStarters(
  position: Position,
  roster: AuctionNextTargetInput['roster'],
): number {
  if (position === 'QB') return roster.qb + roster.superflex;
  if (position === 'RB') return roster.rb;
  if (position === 'WR') return roster.wr;
  if (position === 'TE') return roster.te;
  if (position === 'K') return roster.k ?? 0;
  return roster.def ?? 0;
}

function filledCount(
  signed: AuctionNextTargetInput['signed'],
  position: Position,
): number {
  return signed.filter((p) => p.position === position).length;
}

function expensiveCount(signed: AuctionNextTargetInput['signed']): number {
  return signed.filter((p) => (p.amount ?? 0) >= EXPENSIVE_PIECE).length;
}

/**
 * How much this team should still spend on one player at this stage.
 * Early: room for a star. After two $30+ pieces: mid-tier / filler only.
 */
export function stageSpendCap(
  signed: AuctionNextTargetInput['signed'],
  remainingBudget: number,
  slotsLeft: number,
): number {
  const stars = expensiveCount(signed);
  const pace = slotsLeft > 0 ? remainingBudget / slotsLeft : remainingBudget;
  if (stars >= 2) return Math.max(8, Math.min(24, Math.round(pace * 2.2)));
  if (stars === 1) return Math.max(18, Math.min(56, Math.round(remainingBudget * 0.4)));
  return Math.max(28, Math.min(62, Math.round(remainingBudget * 0.35)));
}

function stubCap(remainingBudget: number, slotsLeft: number): number {
  return Math.max(1, remainingBudget - Math.max(0, slotsLeft - 1));
}

function scoreCandidate(
  strategyId: StrategyId,
  signed: AuctionNextTargetInput['signed'],
  roster: AuctionNextTargetInput['roster'],
  player: AuctionNextTargetInput['available'][number],
): number {
  const round = auctionRound(signed.length);
  const fit = classifyFit(strategyId, round, player.position);
  const filled = filledCount(signed, player.position);
  const open = Math.max(0, requiredStarters(player.position, roster) - filled);
  let score = player.draftScore ?? player.fairValue;
  if (fit === 'primary') score += 40;
  else if (fit === 'secondary') score += 15;
  if (open > 0) score += 20;
  if (filled === 0 && open > 0) score += 15;
  return score;
}

/**
 * Next players this team should actually try to buy, given remaining
 * budget, starter holes, and how many stars it already has.
 */
export function suggestNextTargets(input: AuctionNextTargetInput): AuctionNextPlayer[] {
  const strategyId = asStrategyId(input.strategyId);
  const limit = input.limit ?? 3;
  const owned = new Set(
    input.signed.map((p) => p.playerId).filter((id): id is string => Boolean(id)),
  );
  let signed = [...input.signed];
  let remainingBudget = input.remainingBudget;
  let slotsLeft = input.slotsLeft;
  const pool = input.available.filter((p) => !owned.has(p.playerId));
  const used = new Set<string>();
  const picks: AuctionNextPlayer[] = [];

  const takeable = (): AuctionNextTargetInput['available'] => {
    const cap = Math.min(
      stageSpendCap(signed, remainingBudget, slotsLeft),
      stubCap(remainingBudget, slotsLeft),
    );
    const available = pool.filter((p) => !used.has(p.playerId));
    const hits: AuctionNextTargetInput['available'] = [];
    for (const player of available) {
      if (player.inflatedValue > cap) continue;
      const advice = recommendAuctionLot({
        strategyId,
        position: player.position,
        playerName: player.name,
        fairValue: player.fairValue,
        inflatedValue: player.inflatedValue,
        ceilingValue: player.ceilingValue ?? player.inflatedValue,
        signed,
        remainingBudget,
        slotsLeft,
        roster: input.roster,
        available: available
          .filter((p) => p.playerId !== player.playerId)
          .map((p) => ({ position: p.position, fairValue: p.fairValue })),
        contemplatedPrice: player.inflatedValue,
      });
      if (advice.verdict === 'take') hits.push(player);
    }
    return hits;
  };

  const cheapestAffordable = (): AuctionNextTargetInput['available'][number] | undefined => {
    const cap = stubCap(remainingBudget, slotsLeft);
    return pool
      .filter((p) => !used.has(p.playerId) && p.inflatedValue <= cap)
      .sort((a, b) => a.inflatedValue - b.inflatedValue || (b.draftScore ?? 0) - (a.draftScore ?? 0))[0];
  };

  while (picks.length < limit && remainingBudget > 0 && slotsLeft > 0) {
    const candidates = takeable();
    const player =
      candidates.sort(
        (a, b) =>
          scoreCandidate(strategyId, signed, input.roster, b) -
          scoreCandidate(strategyId, signed, input.roster, a),
      )[0] ?? cheapestAffordable();
    if (!player) break;

    picks.push({
      playerId: player.playerId,
      name: player.name,
      position: player.position,
      inflatedValue: player.inflatedValue,
      fairValue: player.fairValue,
      draftScore: player.draftScore ?? player.fairValue,
    });
    used.add(player.playerId);
    signed = [...signed, { playerId: player.playerId, position: player.position, amount: player.inflatedValue }];
    remainingBudget -= player.inflatedValue;
    slotsLeft -= 1;
  }

  return picks;
}

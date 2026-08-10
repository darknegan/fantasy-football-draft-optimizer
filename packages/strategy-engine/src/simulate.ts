import type { Position, StrategyId } from '@draftlab/domain';
import { strategyFitMultiplier } from './fit.js';
import { snakePickNumbers } from './slots.js';
import { getStrategy } from './strategies.js';

function getStrategySafe(id: StrategyId) {
  return getStrategy(id);
}

export interface SimPlayer {
  id: string;
  name: string;
  position: Position;
  /** Overall ADP pick number (1-based). */
  adpOverall: number;
  draftScore: number;
}

export interface SimulateOptions {
  strategyId: StrategyId;
  slot: number;
  teamCount: number;
  rounds: number;
  iterations: number;
  /** Std-dev as fraction of ADP for opponent board noise. Default 0.12. */
  adpVarianceRatio?: number;
  /** Minimum absolute ADP noise. Default 1.5 picks. */
  adpVarianceFloor?: number;
  /** Deterministic seed for reproducible demos. */
  seed?: number;
  players: SimPlayer[];
  /**
   * When false, skip histogram + common-roster bookkeeping (used by compare-strategies
   * so multi-strategy runs stay inside Worker CPU budgets).
   */
  includeDetails?: boolean;
}

export type ScoreBand = 'miss' | 'bubble' | 'playoff' | 'top3';

export interface ScoreHistogramBin {
  /** Representative score label for the bin (rounded). */
  score: number;
  /** Share of iterations in this bin, 0–1. */
  rate: number;
  band: ScoreBand;
}

export interface CommonRosterSlot {
  slot: 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX';
  playerId: string;
  playerName: string;
  position: Position;
  /** Share of iterations that drafted this player, 0–1. */
  rate: number;
}

export interface StrategySimResult {
  strategyId: StrategyId;
  slot: number;
  iterations: number;
  assumptions: {
    adpVarianceRatio: number;
    adpVarianceFloor: number;
    rounds: number;
    teamCount: number;
    note: string;
  };
  meanRosterScore: number;
  medianRosterScore: number;
  topThirdRate: number;
  /** Share of iterations below the 33rd percentile of this run's scores. */
  bustRate: number;
  positionMix: Record<Position, number>;
  sampleRosters: Array<{ score: number; playerIds: string[]; playerNames: string[] }>;
  /** Outcome distribution for the projected-roster-strength chart. */
  scoreHistogram: ScoreHistogramBin[];
  /** Modal starter-ish lineup by draft frequency. */
  commonRoster: CommonRosterSlot[];
}

/** Mulberry32 — tiny seeded PRNG so sims are reproducible in tests/UI. */
export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  // Box-Muller
  const u = Math.max(rng(), 1e-9);
  const v = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function noisyAdp(player: SimPlayer, rng: () => number, ratio: number, floor: number): number {
  const sigma = Math.max(floor, player.adpOverall * ratio);
  return player.adpOverall + gaussian(rng) * sigma;
}

function pickForUser(
  available: SimPlayer[],
  strategyId: StrategyId,
  round: number,
): SimPlayer | null {
  if (available.length === 0) return null;
  let best: SimPlayer | null = null;
  let bestScore = -Infinity;
  for (const p of available) {
    const fit = strategyFitMultiplier(strategyId, round, p.position);
    const score = p.draftScore * fit;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function pickForCpu(available: SimPlayer[], boardOrder: Map<string, number>): SimPlayer | null {
  if (available.length === 0) return null;
  return available.reduce((a, b) => ((boardOrder.get(a.id) ?? 999) <= (boardOrder.get(b.id) ?? 999) ? a : b));
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  const w = idx - lo;
  return sortedAsc[lo]! * (1 - w) + sortedAsc[hi]! * w;
}

/**
 * Monte Carlo draft simulator.
 * Opponents draft by noisy ADP order; the user drafts by strategyFit × draftScore.
 * Assumptions are returned with the result so the UI can show them.
 */
export function simulateStrategy(opts: SimulateOptions): StrategySimResult {
  const adpVarianceRatio = opts.adpVarianceRatio ?? 0.12;
  const adpVarianceFloor = opts.adpVarianceFloor ?? 1.5;
  const iterations = Math.max(1, opts.iterations);
  const rng = createRng(opts.seed ?? 42);
  const userPicks = new Set(snakePickNumbers(opts.slot, opts.teamCount, opts.rounds));
  const totalPicks = opts.teamCount * opts.rounds;

  const includeDetails = opts.includeDetails !== false;
  const scores: number[] = [];
  const mixTotals: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const samples: StrategySimResult['sampleRosters'] = [];
  const playerHits = new Map<string, { name: string; position: Position; count: number }>();

  for (let i = 0; i < iterations; i++) {
    const boardOrder = new Map<string, number>();
    for (const p of opts.players) {
      boardOrder.set(p.id, noisyAdp(p, rng, adpVarianceRatio, adpVarianceFloor));
    }

    const available = [...opts.players];
    const roster: SimPlayer[] = [];

    for (let pick = 1; pick <= totalPicks; pick++) {
      if (available.length === 0) break;
      const round = Math.floor((pick - 1) / opts.teamCount) + 1;
      const chosen = userPicks.has(pick)
        ? pickForUser(available, opts.strategyId, round)
        : pickForCpu(available, boardOrder);
      if (!chosen) break;
      const idx = available.findIndex((p) => p.id === chosen.id);
      if (idx >= 0) available.splice(idx, 1);
      if (userPicks.has(pick)) roster.push(chosen);
    }

    const score = roster.reduce((s, p) => s + p.draftScore, 0);
    scores.push(score);
    for (const p of roster) {
      mixTotals[p.position] += 1;
      if (includeDetails) {
        const hit = playerHits.get(p.id);
        if (hit) hit.count += 1;
        else playerHits.set(p.id, { name: p.name, position: p.position, count: 1 });
      }
    }

    if (includeDetails && samples.length < 3) {
      samples.push({
        score: Math.round(score * 10) / 10,
        playerIds: roster.map((p) => p.id),
        playerNames: roster.map((p) => p.name),
      });
    }
  }

  scores.sort((a, b) => a - b);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const median = percentile(scores, 0.5);
  // "Top third" among this strategy's own score distribution — for cross-strategy
  // compare we re-rank externally; here we report share above the global-ish bar
  // of mean of all scores in this run's upper tercile threshold.
  const topThirdThreshold = percentile(scores, 2 / 3);
  const bustThreshold = percentile(scores, 1 / 3);
  const topThirdRate = scores.filter((s) => s >= topThirdThreshold).length / scores.length;
  const bustRate = scores.filter((s) => s <= bustThreshold).length / scores.length;

  const totalPosPicks = mixTotals.QB + mixTotals.RB + mixTotals.WR + mixTotals.TE;
  const denom = Math.max(totalPosPicks, 1);
  const positionMix = {
    QB: round2(mixTotals.QB / denom),
    RB: round2(mixTotals.RB / denom),
    WR: round2(mixTotals.WR / denom),
    TE: round2(mixTotals.TE / denom),
  };

  const sigmaLabel = Math.max(
    adpVarianceFloor,
    Math.round(adpVarianceRatio * 60), // illustrative mid-board ADP scale
  );

  return {
    strategyId: opts.strategyId,
    slot: opts.slot,
    iterations,
    assumptions: {
      adpVarianceRatio,
      adpVarianceFloor,
      rounds: opts.rounds,
      teamCount: opts.teamCount,
      note:
        `Each simulated pick draws from a normal distribution around the player’s multi-site ADP ` +
        `with a standard deviation of about ${sigmaLabel} picks (σ = max(${adpVarianceFloor}, ADP × ${adpVarianceRatio})), ` +
        `plus a positional run term. Opponents draft by that noisy ADP board; you draft by strategyFit × DraftScore. ` +
        `Too little variance and every simulation returns the same roster; too much and the output is noise.`,
    },
    meanRosterScore: round2(mean),
    medianRosterScore: round2(median),
    topThirdRate: round2(topThirdRate),
    bustRate: round2(bustRate),
    positionMix,
    sampleRosters: samples,
    scoreHistogram: includeDetails
      ? buildHistogram(scores, topThirdThreshold, bustThreshold)
      : [],
    commonRoster: includeDetails ? buildCommonRoster(playerHits, iterations) : [],
  };
}

export interface CompareStrategiesOptions extends Omit<SimulateOptions, 'strategyId'> {
  strategyIds: StrategyId[];
}

export interface CompareStrategiesResult {
  slot: number;
  iterations: number;
  results: StrategySimResult[];
  ranking: Array<{ strategyId: StrategyId; meanRosterScore: number; topThirdRate: number; rank: number }>;
}

export function compareStrategies(opts: CompareStrategiesOptions): CompareStrategiesResult {
  const strategyIds = opts.strategyIds.filter((id) => Boolean(getStrategySafe(id)));
  const results = strategyIds.map((strategyId, i) =>
    simulateStrategy({
      ...opts,
      strategyId,
      // Compare only needs summary metrics — skip per-strategy roster detail.
      includeDetails: false,
      // Offset seeds so strategies don't share identical opponent boards.
      seed: (opts.seed ?? 42) + i * 997,
    }),
  );

  // Cross-strategy top-third: share of iterations above the 66th pct of pooled means is less
  // meaningful here; instead re-rank by mean roster score and keep each strategy's internal rate.
  const ranking = [...results]
    .sort((a, b) => b.meanRosterScore - a.meanRosterScore)
    .map((r, idx) => ({
      strategyId: r.strategyId,
      meanRosterScore: r.meanRosterScore,
      topThirdRate: r.topThirdRate,
      rank: idx + 1,
    }));

  return { slot: opts.slot, iterations: opts.iterations, results, ranking };
}

function buildHistogram(
  sortedScores: number[],
  topThirdThreshold: number,
  bustThreshold: number,
): ScoreHistogramBin[] {
  if (sortedScores.length === 0) return [];
  const min = sortedScores[0]!;
  const max = sortedScores[sortedScores.length - 1]!;
  const binCount = 14;
  if (max <= min) {
    return [
      {
        score: round2(min),
        rate: 1,
        band: 'playoff',
      },
    ];
  }

  const width = (max - min) / binCount;
  const counts = new Array<number>(binCount).fill(0);
  for (const s of sortedScores) {
    let idx = Math.floor((s - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    counts[idx]! += 1;
  }

  const midPlayoff = (bustThreshold + topThirdThreshold) / 2;
  return counts.map((count, i) => {
    const lo = min + i * width;
    const hi = lo + width;
    const mid = (lo + hi) / 2;
    let band: ScoreBand = 'playoff';
    if (mid <= bustThreshold) band = 'miss';
    else if (mid < midPlayoff) band = 'bubble';
    else if (mid < topThirdThreshold) band = 'playoff';
    else band = 'top3';
    return {
      score: Math.round(mid),
      rate: round2(count / sortedScores.length),
      band,
    };
  });
}

function buildCommonRoster(
  playerHits: Map<string, { name: string; position: Position; count: number }>,
  iterations: number,
): CommonRosterSlot[] {
  const ranked = [...playerHits.entries()]
    .map(([playerId, info]) => ({
      playerId,
      playerName: info.name,
      position: info.position,
      rate: info.count / Math.max(iterations, 1),
    }))
    .sort((a, b) => b.rate - a.rate);

  const takeBest = (pos: Position, used: Set<string>) =>
    ranked.find((p) => p.position === pos && !used.has(p.playerId)) ?? null;

  const used = new Set<string>();
  const slots: CommonRosterSlot[] = [];
  const push = (slot: CommonRosterSlot['slot'], player: (typeof ranked)[number] | null) => {
    if (!player) return;
    used.add(player.playerId);
    slots.push({
      slot,
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      rate: round2(player.rate),
    });
  };

  push('QB', takeBest('QB', used));
  push('RB', takeBest('RB', used));
  push('RB', takeBest('RB', used));
  push('WR', takeBest('WR', used));
  push('WR', takeBest('WR', used));
  push('TE', takeBest('TE', used));
  const flex =
    ranked.find((p) => !used.has(p.playerId) && (p.position === 'RB' || p.position === 'WR' || p.position === 'TE')) ??
    null;
  push('FLEX', flex);
  return slots;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

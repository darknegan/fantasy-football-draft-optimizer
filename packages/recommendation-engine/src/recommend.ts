import type {
  Player,
  PlayerEvaluation,
  PlayerRecommendation,
  Position,
  RecommendationReason,
  RosterShape,
  ScoringProfile,
  StrategyId,
} from '@draftlab/domain';
import {
  getRoundTarget,
  strategyFitMultiplier,
  strategyFitReason,
} from '@draftlab/strategy-engine';
import { positionalFormatScarcity } from './format-scarcity.js';
import { computePositionNeeds, rosterNeedMultiplier } from './roster-need.js';
import { estimateSurvivalProbability, scarcityUrgencyMultiplier } from './scarcity.js';

export interface RecommendContext {
  strategyId: StrategyId;
  round: number;
  picksUntilNext: number;
  /** Overall pick number of the user's next selection (for survival estimates). */
  nextUserPickOverall?: number;
  userRoster: Player[];
  rosterShape: RosterShape;
  /** Number of teams in the league — feeds positionalFormatScarcity's demand calculation.
   * Unlike a plain demand/pool ratio, the nonlinear replacement-cliff curve it uses doesn't
   * cancel this out, so a bigger league genuinely shifts which positions are scarcer. */
  teamCount: number;
  available: Array<{ player: Player; evaluation: PlayerEvaluation }>;
  /** League scoring settings — drives the TE-premium scarcity nudge. Omitted in
   * contexts (mostly tests) that don't have a real league on hand; format
   * scarcity from roster slots alone still applies. */
  scoring?: ScoringProfile;
  targets?: Set<string> | string[];
  avoids?: Set<string> | string[];
  /** 0–1 when a live position run is detected for the player's position. */
  positionRunByPosition?: Partial<Record<Position, number>>;
}

function asSet(input?: Set<string> | string[]): Set<string> {
  if (!input) return new Set();
  return input instanceof Set ? input : new Set(input);
}

export function recommendPlayers(ctx: RecommendContext): PlayerRecommendation[] {
  const needs = computePositionNeeds(ctx.userRoster, ctx.rosterShape);
  const target = getRoundTarget(ctx.strategyId, ctx.round);
  const targets = asSet(ctx.targets);
  const avoids = asSet(ctx.avoids);

  const poolSizeByPosition = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<Position, number>;
  for (const { player } of ctx.available) {
    poolSizeByPosition[player.position] += 1;
  }

  const nextUserPickOverall =
    ctx.nextUserPickOverall ?? Math.max(1, ctx.picksUntilNext + 1);

  const scored = ctx.available.map(({ player, evaluation }) => {
    const strategyFit = strategyFitMultiplier(ctx.strategyId, ctx.round, player.position);
    const rosterNeed = rosterNeedMultiplier(player.position, needs);
    const scarcityUrgency = scarcityUrgencyMultiplier({
      available: ctx.available.map((a) => a.player),
      position: player.position,
      picksUntilNext: ctx.picksUntilNext,
    });
    const formatScarcity = positionalFormatScarcity(
      player.position,
      ctx.rosterShape,
      ctx.teamCount,
      poolSizeByPosition,
      ctx.scoring,
    );

    let contextualScore =
      evaluation.draftScore * strategyFit * rosterNeed * scarcityUrgency * formatScarcity;

    // TE target-share gate: hard cap regardless of other factors.
    if (evaluation.ceiling.failsTargetShareGate) {
      contextualScore *= 0.5;
    }

    if (targets.has(player.id)) contextualScore *= 1.12;
    if (avoids.has(player.id)) contextualScore *= 0.55;

    const reasons: RecommendationReason[] = [];
    const fitReason = strategyFitReason(ctx.strategyId, ctx.round, player.position);
    if (fitReason) reasons.push(fitReason);

    if (targets.has(player.id)) {
      reasons.unshift({ code: 'user_target', message: 'On your target list', severity: 'info' });
    }
    if (avoids.has(player.id)) {
      reasons.unshift({ code: 'user_avoid', message: 'On your avoid list', severity: 'warning' });
    }

    if (evaluation.ceiling.provisional) {
      reasons.push({
        code: 'rb_provisional',
        message: 'RB CeilingScore is provisional — benchmarks not yet loaded',
        severity: 'info',
      });
    }

    if (evaluation.ceiling.failsTargetShareGate) {
      reasons.push({
        code: 'te_target_share_gate',
        message: 'Fails the target-share gate (not top-2 on team targets)',
        severity: 'critical',
      });
    }

    const need = needs.find((n) => n.position === player.position);
    if (need && need.filled < need.required) {
      reasons.push({
        code: 'roster_need',
        message: `Need ${need.required - need.filled} more ${player.position} for starting lineup`,
        severity: 'info',
      });
    }

    if (target.note && strategyFit >= 1.2) {
      reasons.push({ code: 'plan_note', message: target.note, severity: 'info' });
    }

    const adpOverall = evaluation.value.adpOverallPick || evaluation.value.blendedRank || 999;
    const survivalProbability = estimateSurvivalProbability({
      adpOverall,
      nextUserPickOverall,
      picksUntilNext: ctx.picksUntilNext,
      positionRunFactor: ctx.positionRunByPosition?.[player.position] ?? 0,
    });

    return {
      playerId: player.id,
      contextualScore: Math.round(contextualScore * 10) / 10,
      draftScore: evaluation.draftScore,
      strategyFit,
      rosterNeed,
      scarcityUrgency,
      formatScarcity,
      survivalProbability,
      reasons,
      rank: 0,
    } satisfies PlayerRecommendation;
  });

  scored.sort((a, b) => b.contextualScore - a.contextualScore);
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });
  return scored;
}

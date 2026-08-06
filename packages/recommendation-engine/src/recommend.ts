import type {
  Player,
  PlayerEvaluation,
  PlayerRecommendation,
  RecommendationReason,
  RosterShape,
  StrategyId,
} from '@draftlab/domain';
import { getRoundTarget, strategyFitMultiplier, strategyFitReason } from '@draftlab/strategy-engine';
import { computePositionNeeds, rosterNeedMultiplier } from './roster-need.js';
import { scarcityUrgencyMultiplier } from './scarcity.js';

export interface RecommendContext {
  strategyId: StrategyId;
  round: number;
  picksUntilNext: number;
  userRoster: Player[];
  rosterShape: RosterShape;
  available: Array<{ player: Player; evaluation: PlayerEvaluation }>;
}

export function recommendPlayers(ctx: RecommendContext): PlayerRecommendation[] {
  const needs = computePositionNeeds(ctx.userRoster, ctx.rosterShape);
  const target = getRoundTarget(ctx.strategyId, ctx.round);

  const scored = ctx.available.map(({ player, evaluation }) => {
    const strategyFit = strategyFitMultiplier(ctx.strategyId, ctx.round, player.position);
    const rosterNeed = rosterNeedMultiplier(player.position, needs);
    const scarcityUrgency = scarcityUrgencyMultiplier({
      available: ctx.available.map((a) => a.player),
      position: player.position,
      picksUntilNext: ctx.picksUntilNext,
    });

    let contextualScore = evaluation.draftScore * strategyFit * rosterNeed * scarcityUrgency;

    // TE target-share gate: hard cap regardless of other factors.
    if (evaluation.ceiling.failsTargetShareGate) {
      contextualScore *= 0.5;
    }

    const reasons: RecommendationReason[] = [];
    const fitReason = strategyFitReason(ctx.strategyId, ctx.round, player.position);
    if (fitReason) reasons.push(fitReason);

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

    return {
      playerId: player.id,
      contextualScore: Math.round(contextualScore * 10) / 10,
      draftScore: evaluation.draftScore,
      strategyFit,
      rosterNeed,
      scarcityUrgency,
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

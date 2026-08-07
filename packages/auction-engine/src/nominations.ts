import type { AuctionPlayerValue, NominationSuggestion } from '@draftlab/domain';

export interface NominationContext {
  values: AuctionPlayerValue[];
  availableIds: Set<string>;
  targets: Set<string>;
  avoids: Set<string>;
  /** Rival remaining budgets (highest first helps drain strategy). */
  rivalRemaining: number[];
  userRemaining: number;
}

/**
 * Nomination strategy:
 * - Drain: nominate expensive players rivals will bid up when they still have cash.
 * - Target cheap: nominate your targets when rivals are cash-poor.
 * - Value: nominate underpriced (high fair, likely soft room) fillers.
 */
export function suggestNominations(ctx: NominationContext, limit = 5): NominationSuggestion[] {
  const available = ctx.values.filter((v) => ctx.availableIds.has(v.playerId));
  const maxRival = Math.max(0, ...ctx.rivalRemaining);
  const suggestions: NominationSuggestion[] = [];

  for (const v of available) {
    if (ctx.avoids.has(v.playerId)) continue;

    if (ctx.targets.has(v.playerId) && maxRival < v.inflatedValue * 0.85) {
      suggestions.push({
        playerId: v.playerId,
        kind: 'target_cheap',
        priority: 100 + v.inflatedValue,
        reason: 'Target is nominatable while rivals are cash-constrained',
      });
      continue;
    }

    if (v.inflatedValue >= 35 && maxRival >= v.inflatedValue) {
      suggestions.push({
        playerId: v.playerId,
        kind: 'drain',
        priority: 70 + v.inflatedValue * 0.5,
        reason: 'Nominate to drain rival budgets before your targets come up',
      });
      continue;
    }

    if (v.fairValue >= 8 && v.inflatedValue <= v.fairValue * 1.05) {
      suggestions.push({
        playerId: v.playerId,
        kind: 'value',
        priority: 40 + v.vorpShare * 100,
        reason: 'Fairly priced value nomination to fill a roster need',
      });
    }
  }

  return suggestions.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

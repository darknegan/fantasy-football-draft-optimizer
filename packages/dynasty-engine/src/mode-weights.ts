import type { DraftScoreWeights, DynastyMode } from '@draftlab/domain';
import type { PlayerRecommendation } from '@draftlab/domain';

/** Reweight DraftScore components for contend vs rebuild. */
export function dynastyDraftWeights(mode: DynastyMode, base?: DraftScoreWeights): DraftScoreWeights {
  const b = base ?? { ceiling: 0.4, archetype: 0.25, value: 0.2, risk: 0.15 };
  if (mode === 'contend') {
    return {
      ceiling: b.ceiling + 0.08,
      archetype: Math.max(0.1, b.archetype - 0.08),
      value: b.value,
      risk: b.risk,
    };
  }
  if (mode === 'rebuild') {
    return {
      ceiling: Math.max(0.15, b.ceiling - 0.1),
      archetype: b.archetype + 0.15,
      value: b.value,
      risk: Math.max(0.05, b.risk - 0.05),
    };
  }
  return { ...b };
}

/** Apply mode multiplier to contextual recommendations after the redraft scorer. */
export function applyDynastyModeToRecommendations(
  recs: PlayerRecommendation[],
  mode: DynastyMode,
  npvByPlayer: Map<string, number>,
): PlayerRecommendation[] {
  return recs
    .map((r) => {
      const npv = npvByPlayer.get(r.playerId) ?? r.draftScore * 3;
      const npvNorm = npv / 3.5;
      let score = r.contextualScore;
      const reasons = [...r.reasons];

      if (mode === 'rebuild') {
        score = score * 0.55 + npvNorm * 0.45;
        reasons.unshift({
          code: 'dynasty_rebuild',
          message: 'Rebuild mode — long-term asset value weighted up',
          severity: 'info',
        });
      } else if (mode === 'contend') {
        score = score * 0.85 + npvNorm * 0.15;
        reasons.unshift({
          code: 'dynasty_contend',
          message: 'Contend mode — current-season production prioritized',
          severity: 'info',
        });
      } else {
        score = score * 0.7 + npvNorm * 0.3;
      }

      return {
        ...r,
        contextualScore: Math.round(score * 10) / 10,
        reasons,
      };
    })
    .sort((a, b) => b.contextualScore - a.contextualScore)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

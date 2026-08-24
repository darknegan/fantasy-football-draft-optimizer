import type { RosterShape, ScoringProfile } from '@draftlab/domain';

export interface ScoringSummary {
  plainLanguage: string[];
  variant: ScoringProfile['variant'];
  tePremium: boolean;
  superflex: boolean;
  /** Informational — format changes draft guidance, not scoring accuracy. */
  formatNotes: string[];
  warnings: string[];
}

export function summarizeScoring(scoring: ScoringProfile, roster: RosterShape): ScoringSummary {
  const plain: string[] = [];
  const reception = scoring.reception;

  if (reception >= 0.9) plain.push('Full PPR');
  else if (reception >= 0.4) plain.push('Half PPR');
  else plain.push('Standard (0 PPR)');

  plain.push(`${scoring.passTd}-point passing TDs`);
  plain.push(`${scoring.rushTd}-point rushing/receiving TDs`);
  if (scoring.interception !== 0) plain.push(`${scoring.interception} per interception`);

  const tePremium = (scoring.tePremiumBonus ?? 0) > 0;
  if (tePremium) plain.push(`TE premium +${scoring.tePremiumBonus}`);

  const formatNotes: string[] = [];
  const warnings: string[] = [];
  const superflex = roster.superflex > 0 || roster.qb >= 2;
  if (superflex) {
    plain.push(roster.superflex > 0 ? 'Superflex' : '2QB');
    formatNotes.push(
      'Superflex / 2QB — standard QB timing advice (rounds 3–4) does not apply; QBs are early-round assets.',
    );
  }

  return {
    plainLanguage: plain,
    variant: scoring.variant,
    tePremium,
    superflex,
    formatNotes,
    warnings,
  };
}

export function isSuperflex(roster: RosterShape): boolean {
  return roster.superflex > 0 || roster.qb >= 2;
}

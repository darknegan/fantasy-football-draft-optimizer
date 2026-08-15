import type { BoardPlayer, Position } from '../../core/api.types';
import { POSITION_CATALOG_COUNT, configuredFactorCount } from './ceiling-display';
import { scoreLabel } from './score-label';

/** Same defaults as packages/evaluation-engine/src/draft-score.ts */
const DEFAULT_WEIGHTS = {
  ceiling: 0.4,
  archetype: 0.25,
  value: 0.2,
  risk: 0.15,
};

/**
 * Mirror packages/evaluation-engine/src/draft-score.ts.
 * Range is POSITION_CATALOG_COUNT × ±5 (matches CEILING_KNOWN after Task 4).
 */
function normCeiling(score: number | null, pos: Position): number {
  if (score == null) return 50;
  const n = POSITION_CATALOG_COUNT[pos];
  const min = n * -5;
  const max = n * 5;
  return ((score - min) / (max - min)) * 100;
}

function normArchetypeEv(ev: number): number {
  const min = -0.5;
  const max = 1.0;
  return Math.max(0, Math.min(100, ((ev - min) / (max - min)) * 100));
}

function normValue(score: number): number {
  return (score + 100) / 2;
}

function fmtWeight(w: number): string {
  return w.toFixed(2);
}

export function buildScoreTooltip(row: BoardPlayer): string {
  const w = row.evaluation.weights ?? DEFAULT_WEIGHTS;
  const pos = row.player.position;
  const display = scoreLabel(row);
  const ctx = row.recommendation?.contextualScore;
  const contextual = ctx != null && ctx !== row.evaluation.draftScore;
  const ceiling = Math.round(normCeiling(row.evaluation.ceiling.ceilingScore, pos));
  const arch = Math.round(normArchetypeEv(row.evaluation.archetype.archetypeEv));
  const value = Math.round(normValue(row.evaluation.value.valueScore));
  const risk = Math.round(100 - row.evaluation.risk.riskProfile);
  const lines = [
    `Draft score ${display}${contextual ? ' (contextual)' : ''}`,
    `  Ceiling   ${ceiling} × ${fmtWeight(w.ceiling)}`,
    `  Archetype ${arch} × ${fmtWeight(w.archetype)}`,
    `  Value     ${value} × ${fmtWeight(w.value)}`,
    `  Risk      ${risk} × ${fmtWeight(w.risk)}`,
    `→ weighted blend`,
  ];
  return lines.join('\n');
}

export function buildCeilingTooltip(row: BoardPlayer, isTop5: boolean): string {
  const c = row.evaluation.ceiling;
  const configured = configuredFactorCount(row);
  const raw = c.ceilingScore == null ? '—' : String(c.ceilingScore);
  const lines = [`Ceiling ${raw} · ${c.knownFactors}/${configured} known`];
  const factors = c.factors ?? [];
  const graded = factors.filter((f) => f.grade !== 'unknown');
  const top = [...graded]
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 5);
  for (const f of top) {
    const sign = f.weight > 0 ? '+' : '';
    lines.push(`  ${sign}${f.weight} ${f.label} (${f.grade})`);
  }
  const unknownN = factors.filter((f) => f.grade === 'unknown').length;
  if (unknownN > 0) {
    lines.push(`  unknown × ${unknownN} omitted from sum`);
  }
  if (isTop5) {
    lines.push(`Top 5 ${row.player.position} ceiling.`);
  }
  return lines.join('\n');
}

function formatArchetypeLabel(a: string): string {
  switch (a.toUpperCase()) {
    case 'ELITE':
      return 'Elite';
    case 'PROVEN_BREAKOUT_CANDIDATE':
      return 'Proven';
    case 'TRUSTY_VETERAN':
      return 'Trusty Veteran';
    case 'VETERAN':
      return 'Veteran';
    case 'IN_THEIR_PRIME':
      return 'In Their Prime';
    case 'BREAKOUT_CANDIDATE':
      return 'Breakout';
    default:
      return a
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function buildArchetypeTooltip(row: BoardPlayer, why: string): string {
  const a = row.evaluation.archetype;
  const lines = [
    `${formatArchetypeLabel(a.archetype)} · EV ${a.archetypeEv.toFixed(2)}`,
    `  Why: ${why}`,
  ];
  if (a.rates) {
    lines.push(
      `  Boom ${pct(a.rates.boomRate)} · Bust ${pct(a.rates.bustRate)} · Injury ${pct(a.rates.injuryRate)} · Return ${pct(a.rates.returnRate)} · Fine ${pct(a.rates.fineRate)}`,
    );
  }
  return lines.join('\n');
}

/** Mirror packages/evaluation-engine/src/archetype.ts `explainArchetype` (web cannot import the engine). */
function overHalf(finishCount: number, seasonsInLeague: number): boolean {
  return finishCount > seasonsInLeague / 2;
}

function explainSkillPosition(player: BoardPlayer['player']): string {
  const top5 = player.positionalTop5FinishCount ?? 0;
  const top8 = player.positionalTop8FinishCount ?? 0;
  const top12 = player.positionalTop12FinishCount ?? 0;
  const seasons = player.seasonsInLeague;

  if (seasons <= 3 && top5 === 0) {
    return `yr ${seasons}, no top-5 finishes → rule 1`;
  }
  if (seasons <= 3 && top5 === 1) {
    return `yr ${seasons}, 1 top-5 finish → rule 2`;
  }
  if (seasons <= 4 && top5 >= 2) {
    return `yr ${seasons}, ${top5} top-5 finishes → rule 3`;
  }
  if (seasons > 4 && overHalf(top8, seasons)) {
    return `yr ${seasons}, top-8 in ${top8}/${seasons} seasons (over half) → rule 4`;
  }
  if (seasons > 4 && overHalf(top12, seasons)) {
    return `yr ${seasons}, top-12 in ${top12}/${seasons} seasons (over half) → rule 5`;
  }
  if (seasons >= 7 || player.age >= 28) {
    const gates: string[] = [];
    if (player.age >= 28) gates.push(`age ${player.age}`);
    if (seasons >= 7) gates.push(`yr ${seasons}`);
    return `${gates.join(', ')} — aging without half-rate pedigree → rule 6`;
  }
  return `yr ${seasons}, mid-career without half-rate pedigree → rule 7`;
}

function explainQb(player: BoardPlayer['player']): string {
  const top5 = player.positionalTop5FinishCount ?? 0;
  const top8 = player.positionalTop8FinishCount ?? 0;
  const top12 = player.positionalTop12FinishCount ?? 0;
  const seasons = player.seasonsInLeague;

  if (seasons <= 3 && top5 === 0) {
    return `yr ${seasons}, no top-5 finishes → rule 1`;
  }
  if (seasons <= 3 && top5 === 1) {
    return `yr ${seasons}, 1 top-5 finish → rule 2`;
  }
  if (seasons <= 4 && top5 >= 2) {
    return `yr ${seasons}, ${top5} top-5 finishes → rule 3`;
  }
  if (seasons > 4 && overHalf(top8, seasons)) {
    return `yr ${seasons}, top-8 in ${top8}/${seasons} seasons (over half) → rule 4`;
  }
  if (seasons > 4 && overHalf(top12, seasons)) {
    return `yr ${seasons}, top-12 in ${top12}/${seasons} seasons (over half) → rule 5`;
  }
  if (player.age >= 34) {
    return `age ${player.age} — aging without half-rate pedigree → rule 6`;
  }
  return `yr ${seasons}, mid-career without half-rate pedigree → rule 7`;
}

export function explainBoardArchetype(row: BoardPlayer): string {
  if (row.player.position === 'QB') return explainQb(row.player);
  return explainSkillPosition(row.player);
}

/** Spec §7 — one-line purpose blurbs for board column headers. */
export const BOARD_HEADER_PURPOSE: Record<string, string> = {
  '#': 'Rank on this board (recommendation rank when present, else sort order).',
  POS: "Player's fantasy position.",
  PLAYER: 'Name, NFL team, age, and seasons in the league.',
  ADP: "Average draft position (round.pick) from the league's ADP source.",
  SCORE: 'DraftScore — weighted blend of ceiling, archetype, value, and risk.',
  CEILING: 'Raw sum of graded ceiling-factor weights. Green = top 5 at this position.',
  CONF: "How many ceiling factors are known vs configured for this player's position.",
  ARCHETYPE: 'Career-stage bucket from finish history (and age/year gates).',
  RISK: 'Injury / availability risk profile (higher = more games expected missed).',
  VALUE: 'Market mispricing vs blended rank (positive = undervalued).',
  VOR: 'Projected points above the last startable player at this position in this league.',
  PROJ: 'Season-long projected fantasy points when available.',
  FACTORS: 'Per-factor grade strip that feeds Ceiling (length = position catalog).',
  FLAG: 'Pin as a draft target',
};

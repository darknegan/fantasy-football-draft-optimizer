export interface ScoreLabelRow {
  evaluation: { draftScore: number };
  recommendation?: { contextualScore?: number };
}

export function scoreLabel(row: ScoreLabelRow): string {
  const s = row.recommendation?.contextualScore ?? row.evaluation.draftScore;
  return String(Math.round(s));
}

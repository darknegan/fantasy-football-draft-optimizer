import type { ValueResult } from '@draftlab/domain';

export interface ValueInput {
  fseRank?: number | null;
  espnProjectionRank?: number | null;
  /** ADP as round.pick, e.g. 3.04 */
  adpRoundPick: string;
  teamCount: number;
  /** Optional weight for FSE vs ESPN when blending ranks. */
  fseWeight?: number;
  scalingFactor?: number;
}

export function adpToOverallPick(adpRoundPick: string, teamCount: number): number {
  const [roundStr, pickStr] = adpRoundPick.split('.');
  const round = Number(roundStr);
  const pick = Number(pickStr);
  if (!Number.isFinite(round) || !Number.isFinite(pick)) return Number.NaN;
  return (round - 1) * teamCount + pick;
}

export function evaluateValue(input: ValueInput): ValueResult {
  const teamCount = input.teamCount;
  const adpOverallPick = adpToOverallPick(input.adpRoundPick, teamCount);
  const fse = input.fseRank ?? null;
  const espn = input.espnProjectionRank ?? null;
  const fseWeight = input.fseWeight ?? 0.6;
  const scalingFactor = input.scalingFactor ?? 1.5;

  let blendedRank: number;
  if (fse != null && espn != null) {
    blendedRank = fseWeight * fse + (1 - fseWeight) * espn;
  } else if (fse != null) {
    blendedRank = fse;
  } else if (espn != null) {
    blendedRank = espn;
  } else {
    blendedRank = adpOverallPick;
  }

  const raw = (adpOverallPick - blendedRank) * scalingFactor;
  const valueScore = Math.max(-100, Math.min(100, raw));

  return {
    valueScore: Math.round(valueScore * 10) / 10,
    adpOverallPick,
    blendedRank: Math.round(blendedRank * 10) / 10,
    fseRank: fse,
    espnProjectionRank: espn,
    adpRoundPick: input.adpRoundPick,
  };
}

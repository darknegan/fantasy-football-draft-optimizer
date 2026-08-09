import type { ValueResult } from '@draftlab/domain';

export interface ValueInput {
  fseRank?: number | null;
  espnProjectionRank?: number | null;
  /**
   * Mechanical fallback used only when neither fseRank nor espnProjectionRank
   * is available: season-long projected-points rank OVERALL across all
   * positions, from sleeperMCP's build_factors.py (Sleeper's own undocumented
   * weekly projections, summed). An independent opinion of expected output,
   * same role as the two licensed ranks, just sourced differently — not
   * derived from this engine's own ceiling/archetype, which would be
   * circular. Has no positional-scarcity adjustment (unlike an analyst
   * big-board), so it ranks QBs earlier than fseRank/espnProjectionRank
   * would — a known, stated limitation of the fallback, not a bug.
   */
  projectedRank?: number | null;
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
  const projected = input.projectedRank ?? null;
  const fseWeight = input.fseWeight ?? 0.6;
  const scalingFactor = input.scalingFactor ?? 1.5;

  let blendedRank: number;
  let usedMechanicalFallback = false;
  if (fse != null && espn != null) {
    blendedRank = fseWeight * fse + (1 - fseWeight) * espn;
  } else if (fse != null) {
    blendedRank = fse;
  } else if (espn != null) {
    blendedRank = espn;
  } else if (projected != null) {
    blendedRank = projected;
    usedMechanicalFallback = true;
  } else {
    blendedRank = adpOverallPick;
  }

  // The mechanical fallback has no situational judgment — no aging curve, no committee/
  // depth-chart awareness, nothing a real analyst opinion would apply. That is exactly the
  // context behind the biggest real ADP-vs-projection gaps (an aging star correctly going
  // late, a committee back's raw points overstating his role), so treating it with full
  // confidence turns real-world discounting into a fake "bargain": Travis Kelce — a
  // declining future Hall-of-Famer correctly going late in ADP — read as a massive value
  // pick purely because raw projected points don't know he's declining. Halved rather than
  // trusted at full strength until a licensed fseRank/espnProjectionRank exists.
  const FALLBACK_CONFIDENCE = 0.5;
  const rawGap = (adpOverallPick - blendedRank) * scalingFactor;
  const raw = usedMechanicalFallback ? rawGap * FALLBACK_CONFIDENCE : rawGap;
  const valueScore = Math.max(-100, Math.min(100, raw));

  return {
    valueScore: Math.round(valueScore * 10) / 10,
    adpOverallPick,
    blendedRank: Math.round(blendedRank * 10) / 10,
    fseRank: fse,
    espnProjectionRank: espn,
    projectedRank: projected,
    usedMechanicalFallback,
    adpRoundPick: input.adpRoundPick,
  };
}

import type { DraftPickAsset } from '@draftlab/domain';

/** Baseline fair values for future picks relative to a top-board dynasty NPV (~200). */
const ROUND_BASE: Record<number, number> = {
  1: 85,
  2: 45,
  3: 22,
  4: 10,
};

export interface TradedPickInput {
  season: number;
  round: number;
  roster_id: number | string;
  owner_id: number | string;
  previous_owner_id?: number | string;
}

export function estimatePickValue(season: number, round: number, currentSeason: number): number {
  const base = ROUND_BASE[round] ?? Math.max(4, 18 - round * 4);
  const yearsOut = Math.max(0, season - currentSeason);
  // Near-term picks are worth more; discount ~12% per year out.
  const discounted = base * Math.pow(0.88, yearsOut);
  return Math.round(discounted * 10) / 10;
}

export function labelPick(season: number, round: number): string {
  const ordinal =
    round === 1 ? '1st' : round === 2 ? '2nd' : round === 3 ? '3rd' : `${round}th`;
  return `${season} ${ordinal}`;
}

export function mapTradedPicks(
  inputs: TradedPickInput[],
  currentSeason: number,
  rosterIdPrefix = 'roster-',
): DraftPickAsset[] {
  return inputs.map((p, i) => {
    const original = `${rosterIdPrefix}${p.roster_id}`;
    const owner = `${rosterIdPrefix}${p.owner_id}`;
    return {
      id: `pick-${p.season}-r${p.round}-${p.roster_id}-${i}`,
      season: p.season,
      round: p.round,
      originalRosterId: original,
      ownerRosterId: owner,
      estimatedValue: estimatePickValue(p.season, p.round, currentSeason),
      label: labelPick(p.season, p.round),
    };
  });
}

/** Seed a typical dynasty pick portfolio for demo / offline leagues. */
export function seedPickAssets(
  teamCount: number,
  currentSeason: number,
  userRosterId: string,
): DraftPickAsset[] {
  const assets: DraftPickAsset[] = [];
  for (let yearOffset = 1; yearOffset <= 2; yearOffset++) {
    const season = currentSeason + yearOffset;
    for (let round = 1; round <= 3; round++) {
      // User owns their own picks plus one extra mid-round from a trade.
      assets.push({
        id: `own-${season}-r${round}`,
        season,
        round,
        originalRosterId: userRosterId,
        ownerRosterId: userRosterId,
        estimatedValue: estimatePickValue(season, round, currentSeason),
        label: labelPick(season, round),
      });
    }
  }
  // One incoming early pick from a rival.
  assets.push({
    id: `trade-in-${currentSeason + 1}-r1`,
    season: currentSeason + 1,
    round: 1,
    originalRosterId: `${userRosterId}-rival-2`,
    ownerRosterId: userRosterId,
    estimatedValue: estimatePickValue(currentSeason + 1, 1, currentSeason) * 0.95,
    label: labelPick(currentSeason + 1, 1) + ' (acquired)',
  });
  // Outbound third to keep the ledger honest.
  assets.push({
    id: `trade-out-${currentSeason + 2}-r3`,
    season: currentSeason + 2,
    round: 3,
    originalRosterId: userRosterId,
    ownerRosterId: `roster-rival-${Math.min(3, teamCount)}`,
    estimatedValue: estimatePickValue(currentSeason + 2, 3, currentSeason),
    label: labelPick(currentSeason + 2, 3) + ' (traded away)',
  });
  return assets;
}

export function ownedPickValue(assets: DraftPickAsset[], rosterId: string): number {
  return Math.round(
    assets.filter((a) => a.ownerRosterId === rosterId).reduce((s, a) => s + a.estimatedValue, 0) * 10,
  ) / 10;
}

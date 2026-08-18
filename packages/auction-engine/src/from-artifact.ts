import type {
  AuctionPlayerValue,
  RosterShape,
  ScoringProfile,
  ScoringVariant,
} from '@draftlab/domain';

export const AUCTION_BOARD_IDS = [
  '1qb-full-ppr',
  '1qb-half-ppr',
  'superflex-full-ppr',
] as const;

export type AuctionBoardId = (typeof AUCTION_BOARD_IDS)[number];

export interface AuctionBoardFormat {
  ppr: number;
  numQbs: number;
  numTeams: number;
  isDynasty: boolean;
}

export interface AuctionBoardPlayer {
  name: string;
  position: string;
  team: string | null;
  sleeper_id: string | null;
  market_value: number;
  fair: number;
  max: number;
  overall_rank?: number | null;
  position_rank?: number | null;
}

export interface AuctionValuesArtifact {
  schema_version: number;
  generated_at: string;
  id: string;
  label: string;
  budget: number;
  num_teams: number;
  roster_spots: number;
  format: AuctionBoardFormat;
  players: AuctionBoardPlayer[];
  sum_fair?: number;
}

export interface AuctionPoolShape {
  budget: number;
  teams: number;
  slots: number;
}

/**
 * Pick the sleeperMCP auction board that best matches league scoring + QB
 * demand. Superflex / 2QB always uses the SF full-PPR board (the only SF
 * snapshot published). 1QB standard falls back to half-PPR — closest published
 * reception value.
 */
export function selectAuctionBoardId(opts: {
  variant: ScoringVariant;
  superflex: boolean;
}): AuctionBoardId {
  if (opts.superflex) return 'superflex-full-ppr';
  if (opts.variant === 'ppr') return '1qb-full-ppr';
  return '1qb-half-ppr';
}

export function selectAuctionBoard(
  boards: AuctionValuesArtifact[],
  opts: { scoring: ScoringProfile; roster: RosterShape },
): AuctionValuesArtifact | null {
  const superflex = opts.roster.superflex > 0 || opts.roster.qb >= 2;
  const id = selectAuctionBoardId({ variant: opts.scoring.variant, superflex });
  return boards.find((b) => b.id === id) ?? null;
}

/** Discretionary dollars above the $1-per-slot floor. */
export function discretionaryPool(pool: AuctionPoolShape): number {
  return Math.max(0, pool.budget * pool.teams - pool.slots * pool.teams);
}

/**
 * Re-scale an artifact fair price (which already includes a $1 floor) into a
 * different budget / team / roster-size pool.
 */
export function rescaleAuctionFair(fair: number, from: AuctionPoolShape, to: AuctionPoolShape): number {
  const fromDisc = discretionaryPool(from);
  const toDisc = discretionaryPool(to);
  if (fromDisc === toDisc) return Math.max(1, Math.round(fair));
  if (fromDisc <= 0) return 1;
  const aboveFloor = Math.max(0, fair - 1);
  return Math.max(1, Math.round(aboveFloor * (toDisc / fromDisc)) + 1);
}

export function dollarValuesFromAuctionBoard(
  board: AuctionValuesArtifact,
  opts: {
    sleeperIdToPlayerId: Map<string, string>;
    teamCount: number;
    budgetPerTeam: number;
    rosterSlots: number;
  },
): AuctionPlayerValue[] {
  const from: AuctionPoolShape = {
    budget: board.budget,
    teams: board.num_teams,
    slots: board.roster_spots,
  };
  const to: AuctionPoolShape = {
    budget: opts.budgetPerTeam,
    teams: opts.teamCount,
    slots: opts.rosterSlots,
  };

  const matched: Array<{ playerId: string; fair: number; ceiling: number; market: number }> = [];
  let totalMarket = 0;
  for (const row of board.players) {
    const sleeperId = row.sleeper_id != null ? String(row.sleeper_id) : '';
    if (!sleeperId) continue;
    const playerId = opts.sleeperIdToPlayerId.get(sleeperId);
    if (!playerId) continue;
    const market = Number(row.market_value) || 0;
    const fair = rescaleAuctionFair(Number(row.fair) || 1, from, to);
    const ceiling = Math.max(fair, rescaleAuctionFair(Number(row.max) || fair, from, to));
    matched.push({
      playerId,
      fair,
      ceiling,
      market,
    });
    totalMarket += Math.max(0, market);
  }

  return matched
    .map((p) => {
      const vorpShare = totalMarket > 0 ? Math.round((Math.max(0, p.market) / totalMarket) * 10000) / 10000 : 0;
      return {
        playerId: p.playerId,
        fairValue: p.fair,
        inflatedValue: p.fair,
        ceilingValue: p.ceiling,
        vorpShare,
      };
    })
    .sort((a, b) => b.fairValue - a.fairValue || b.vorpShare - a.vorpShare);
}

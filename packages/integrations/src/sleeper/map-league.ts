import type { DraftType, League, LeagueType, RosterShape, ScoringProfile, ScoringVariant } from '@draftlab/domain';
import type { SleeperDraft, SleeperLeague } from './client.js';
import { summarizeScoring } from './scoring-summary.js';

export function mapRosterPositions(positions: string[]): RosterShape {
  const count = (p: string) => positions.filter((x) => x === p).length;
  const qb = count('QB');
  const rb = count('RB');
  const wr = count('WR');
  const te = count('TE');
  const flex = count('FLEX');
  const superflex = count('SUPER_FLEX');
  const k = count('K');
  const def = count('DEF') + count('DST');
  const bench = count('BN');
  return {
    qb,
    rb,
    wr,
    te,
    flex,
    superflex,
    k,
    def,
    bench,
    totalStarters: qb + rb + wr + te + flex + superflex + k + def,
  };
}

export function mapScoring(settings: Record<string, number>): ScoringProfile {
  const reception = settings['rec'] ?? 0;
  const teRec = settings['bonus_rec_te'] ?? settings['rec_te'] ?? 0;
  let variant: ScoringVariant = 'standard';
  if (reception >= 0.9) variant = 'ppr';
  else if (reception >= 0.4) variant = 'half_ppr';

  return {
    id: `sleeper-${variant}${teRec ? '-tep' : ''}`,
    name: `Sleeper ${variant.toUpperCase()}${teRec ? ' TE Premium' : ''}`,
    variant,
    passYd: settings['pass_yd'] ?? 0.04,
    passTd: settings['pass_td'] ?? 4,
    interception: settings['pass_int'] ?? -2,
    rushYd: settings['rush_yd'] ?? 0.1,
    rushTd: settings['rush_td'] ?? 6,
    reception,
    tePremiumBonus: teRec || undefined,
    recYd: settings['rec_yd'] ?? 0.1,
    recTd: settings['rec_td'] ?? 6,
    fumbleLost: settings['fum_lost'] ?? -2,
  };
}

export function mapDraftType(type: string | undefined): DraftType {
  if (type === 'auction') return 'auction';
  if (type === 'linear') return 'linear';
  return 'snake';
}

/** Sleeper settings.type: 0 = redraft, 1 = keeper, 2 = dynasty (integer from API). */
export function mapLeagueType(settings: Record<string, number | string> | undefined): LeagueType {
  const raw = settings?.['type'] ?? settings?.['league_type'];
  const code =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw.trim())
        ? Number.parseInt(raw, 10)
        : NaN;

  switch (code) {
    case 2:
      return 'dynasty';
    case 1:
      // Keeper — no distinct LeagueType yet; treat as redraft for board guidance.
      return 'redraft';
    case 0:
      return 'redraft';
  }

  const text = String(raw ?? '').toLowerCase();
  if (text.includes('dynasty')) return 'dynasty';
  if (text.includes('auction')) return 'auction';
  return 'redraft';
}

export function mapSleeperLeague(
  league: SleeperLeague,
  opts?: { userId?: string; draftSlot?: number; draft?: SleeperDraft | null },
): League {
  const draft = opts?.draft;
  const roster = mapRosterPositions(league.roster_positions ?? []);
  const scoring = mapScoring(league.scoring_settings ?? {});
  return {
    // Opaque id; API persistence upserts by (userId, platform, externalId).
    id: globalThis.crypto.randomUUID(),
    userId: opts?.userId ?? '',
    name: league.name,
    platform: 'sleeper',
    externalId: league.league_id,
    type: mapLeagueType(league.settings),
    draftType: mapDraftType(draft?.type),
    teamCount: league.total_rosters,
    season: Number(league.season),
    scoring,
    roster,
    draftSlot: opts?.draftSlot,
    sleeperDraftId: draft?.draft_id ?? league.draft_id ?? undefined,
  };
}

export function scoringConfirmation(league: League) {
  return summarizeScoring(league.scoring, league.roster);
}

/** Resolve the user's draft slot from Sleeper draft_order map. */
export function resolveDraftSlot(
  draft: SleeperDraft,
  sleeperUserId: string,
): number | undefined {
  const order = draft.draft_order;
  if (!order) return undefined;
  const slot = order[sleeperUserId];
  return typeof slot === 'number' ? slot : undefined;
}

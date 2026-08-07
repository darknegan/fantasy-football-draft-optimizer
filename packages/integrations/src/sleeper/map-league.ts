import type { League, RosterShape, ScoringProfile, ScoringVariant } from '@draftlab/domain';
import type { SleeperLeague } from './client.js';

export function mapRosterPositions(positions: string[]): RosterShape {
  const count = (p: string) => positions.filter((x) => x === p).length;
  const qb = count('QB');
  const rb = count('RB');
  const wr = count('WR');
  const te = count('TE');
  const flex = count('FLEX');
  const superflex = count('SUPER_FLEX');
  const bench = count('BN');
  return {
    qb,
    rb,
    wr,
    te,
    flex,
    superflex,
    bench,
    totalStarters: qb + rb + wr + te + flex + superflex,
  };
}

export function mapScoring(settings: Record<string, number>): ScoringProfile {
  const reception = settings['rec'] ?? 0;
  let variant: ScoringVariant = 'standard';
  if (reception >= 0.9) variant = 'ppr';
  else if (reception >= 0.4) variant = 'half_ppr';

  return {
    id: `sleeper-${variant}`,
    name: `Sleeper ${variant.toUpperCase()}`,
    variant,
    passYd: settings['pass_yd'] ?? 0.04,
    passTd: settings['pass_td'] ?? 4,
    interception: settings['pass_int'] ?? -2,
    rushYd: settings['rush_yd'] ?? 0.1,
    rushTd: settings['rush_td'] ?? 6,
    reception,
    recYd: settings['rec_yd'] ?? 0.1,
    recTd: settings['rec_td'] ?? 6,
    fumbleLost: settings['fum_lost'] ?? -2,
  };
}

export function mapSleeperLeague(league: SleeperLeague, opts?: { draftSlot?: number }): League {
  return {
    id: `sleeper-${league.league_id}`,
    name: league.name,
    platform: 'sleeper',
    externalId: league.league_id,
    type: 'redraft',
    draftType: 'snake',
    teamCount: league.total_rosters,
    season: Number(league.season),
    scoring: mapScoring(league.scoring_settings ?? {}),
    roster: mapRosterPositions(league.roster_positions ?? []),
    draftSlot: opts?.draftSlot,
    sleeperDraftId: league.draft_id ?? undefined,
  };
}

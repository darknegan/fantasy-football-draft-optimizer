import type { DraftType, League, LeagueType, RosterShape, ScoringProfile, StrategyId } from '@draftlab/domain';

export interface ManualLeagueInput {
  name: string;
  type?: LeagueType;
  draftType?: DraftType;
  teamCount: number;
  season: number;
  scoring: ScoringProfile;
  roster: RosterShape;
  draftSlot?: number;
  strategyId?: StrategyId;
}

export function createManualLeague(input: ManualLeagueInput): League {
  const id = `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: input.name,
    platform: 'manual',
    type: input.type ?? 'redraft',
    draftType: input.draftType ?? 'snake',
    teamCount: input.teamCount,
    season: input.season,
    scoring: input.scoring,
    roster: input.roster,
    draftSlot: input.draftSlot,
    strategyId: input.strategyId ?? 'balanced',
  };
}

export const SCORING_PRESETS: ScoringProfile[] = [
  {
    id: 'preset-ppr',
    name: 'Full PPR',
    variant: 'ppr',
    passYd: 0.04,
    passTd: 4,
    interception: -2,
    rushYd: 0.1,
    rushTd: 6,
    reception: 1,
    recYd: 0.1,
    recTd: 6,
    fumbleLost: -2,
  },
  {
    id: 'preset-half-ppr',
    name: 'Half PPR',
    variant: 'half_ppr',
    passYd: 0.04,
    passTd: 4,
    interception: -2,
    rushYd: 0.1,
    rushTd: 6,
    reception: 0.5,
    recYd: 0.1,
    recTd: 6,
    fumbleLost: -2,
  },
  {
    id: 'preset-standard',
    name: 'Standard',
    variant: 'standard',
    passYd: 0.04,
    passTd: 4,
    interception: -2,
    rushYd: 0.1,
    rushTd: 6,
    reception: 0,
    recYd: 0.1,
    recTd: 6,
    fumbleLost: -2,
  },
];

export const DEFAULT_ROSTER_12: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  bench: 6,
  totalStarters: 7,
};

import type {
  ContractRules,
  DraftType,
  DynastyMode,
  League,
  LeagueType,
  RosterShape,
  ScoringProfile,
  StrategyId,
} from '@draftlab/domain';

export interface ManualLeagueInput {
  /** DraftLab account owner. Required for persisted leagues. */
  userId?: string;
  name: string;
  type?: LeagueType;
  draftType?: DraftType;
  teamCount: number;
  season: number;
  scoring: ScoringProfile;
  roster: RosterShape;
  draftSlot?: number;
  strategyId?: StrategyId;
  dynastyMode?: DynastyMode;
  auctionBudget?: number;
  contractRules?: ContractRules;
}

export function createManualLeague(input: ManualLeagueInput): League {
  const id = crypto.randomUUID();
  const roster = {
    ...input.roster,
    totalStarters:
      input.roster.qb +
      input.roster.rb +
      input.roster.wr +
      input.roster.te +
      input.roster.flex +
      input.roster.superflex,
  };
  return {
    id,
    userId: input.userId ?? '',
    name: input.name,
    platform: 'manual',
    type: input.type ?? 'redraft',
    draftType: input.draftType ?? 'snake',
    teamCount: input.teamCount,
    season: input.season,
    scoring: input.scoring,
    roster,
    draftSlot: input.draftSlot,
    strategyId: input.strategyId ?? 'balanced',
    dynastyMode: input.dynastyMode,
    auctionBudget: input.auctionBudget,
    contractRules: input.contractRules,
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
  {
    id: 'preset-te-premium',
    name: 'PPR + TE Premium',
    variant: 'ppr',
    passYd: 0.04,
    passTd: 4,
    interception: -2,
    rushYd: 0.1,
    rushTd: 6,
    reception: 1,
    tePremiumBonus: 0.5,
    recYd: 0.1,
    recTd: 6,
    fumbleLost: -2,
  },
  {
    id: 'preset-sf-ppr',
    name: 'Superflex PPR',
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

export const DEFAULT_ROSTER_SUPERFLEX: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 1,
  bench: 6,
  totalStarters: 8,
};

export function rosterPresetForScoring(scoringPresetId: string | undefined): RosterShape {
  if (scoringPresetId === 'preset-sf-ppr') return { ...DEFAULT_ROSTER_SUPERFLEX };
  return { ...DEFAULT_ROSTER_12 };
}

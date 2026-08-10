export type Position = 'QB' | 'RB' | 'WR' | 'TE';
export type FactorGrade = 'green' | 'yellow' | 'orange' | 'red' | 'unknown';
export type StrategyTier = 'S' | 'A' | 'B' | 'C' | 'unrated';

export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  age: number;
  seasonsInLeague: number;
  status: string;
}

export interface GradedFactor {
  factorId: string;
  label: string;
  value: number | null;
  grade: FactorGrade;
  weight: number;
}

export interface PlayerEvaluation {
  playerId: string;
  ceiling: {
    ceilingScore: number | null;
    factors: GradedFactor[];
    knownFactors: number;
    confidenceScore: number;
    provisional: boolean;
    failsTargetShareGate?: boolean;
  };
  archetype: {
    archetype: string;
    archetypeEv: number;
  };
  risk: { riskProfile: number; expectedGamesMissed: number };
  value: { valueScore: number; adpRoundPick: string; blendedRank: number };
  draftScore: number;
}

export interface RecommendationReason {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface PlayerRecommendation {
  playerId: string;
  contextualScore: number;
  draftScore: number;
  strategyFit: number;
  rosterNeed: number;
  scarcityUrgency: number;
  reasons: RecommendationReason[];
  rank: number;
}

export interface BoardPlayer {
  player: Player;
  evaluation: PlayerEvaluation;
  recommendation?: PlayerRecommendation;
  drafted: boolean;
  target?: boolean;
  avoid?: boolean;
}

export interface ScoringSummary {
  plainLanguage: string[];
  variant: string;
  tePremium: boolean;
  superflex: boolean;
  warnings: string[];
}

export interface League {
  id: string;
  userId: string;
  name: string;
  platform: 'sleeper' | 'manual';
  type: string;
  draftType: string;
  teamCount: number;
  season: number;
  draftSlot?: number;
  strategyId?: string;
  sleeperDraftId?: string;
  scoringSummary?: ScoringSummary;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  definition: string;
  tier: StrategyTier;
  rounds: Array<{
    round: number;
    primary: Position[];
    secondary: Position[];
    avoid: Position[];
    note: string;
  }>;
}

export interface DraftState {
  leagueId: string;
  draftId: string;
  status: string;
  currentPick: number;
  picks: Array<{
    pickNumber: number;
    round: number;
    slot: number;
    playerId: string | null;
    rosterId: string;
    source: string;
  }>;
  userRosterId: string;
  lastSyncedAt: string | null;
  syncMode: string;
  syncBanner?: string | null;
  picksUntilUser?: number | null;
}

export interface AdherenceResult {
  score: number;
  state: 'on_plan' | 'drifting' | 'pivot_recommended';
  offPlanCount: number;
  gapPositions: string[];
}

export interface DraftRecap {
  leagueId: string;
  strategyId: string;
  adherence: AdherenceResult;
  rosterByPosition: Record<
    string,
    Array<{ id: string; name: string; draftScore: number; pickNumber: number }>
  >;
  meanDraftScore: number;
  bestValue: { id: string; name: string; valueScore: number; pickNumber: number } | null;
  worstValue: { id: string; name: string; valueScore: number; pickNumber: number } | null;
  weaknesses: string[];
}

export interface DraftSlotInfo {
  slot: number;
  tier: StrategyTier;
  pickNumbers: number[];
}

export interface StrategySimResult {
  strategyId: string;
  slot: number;
  iterations: number;
  assumptions: {
    adpVarianceRatio: number;
    adpVarianceFloor: number;
    rounds: number;
    teamCount: number;
    note: string;
  };
  meanRosterScore: number;
  medianRosterScore: number;
  topThirdRate: number;
  positionMix: Record<Position, number>;
  sampleRosters: Array<{ score: number; playerIds: string[]; playerNames: string[] }>;
}

export interface CompareStrategiesResult {
  slot: number;
  iterations: number;
  results: StrategySimResult[];
  ranking: Array<{
    strategyId: string;
    meanRosterScore: number;
    topThirdRate: number;
    rank: number;
  }>;
}

export interface CheatSheetPlayerRow {
  id: string;
  name: string;
  position: Position;
  draftScore: number;
  ceilingScore: number | null;
  provisional: boolean;
  ceilingKnownFactors: number;
  adpRoundPick: string;
  target?: boolean;
  avoid?: boolean;
}

export interface CheatSheetGroup {
  position: Position;
  tiers: Array<{
    tier: string;
    label: string;
    players: CheatSheetPlayerRow[];
  }>;
  /** No measured production at all (usually a rookie/backup) — excluded from S-D tiers. */
  unranked: CheatSheetPlayerRow[];
}

export type DynastyMode = 'contend' | 'rebuild' | 'neutral';

export interface DynastyOverview {
  leagueId: string;
  mode: DynastyMode;
  ageCurve: {
    meanAge: number;
    medianAge: number;
    buckets: Array<{ label: string; count: number; playerIds: string[] }>;
    contendScore: number;
    rebuildScore: number;
  };
  pickAssets: Array<{
    id: string;
    season: number;
    round: number;
    ownerRosterId: string;
    estimatedValue: number;
    label: string;
  }>;
  ownedPickValue: number;
  board: Array<{
    playerId: string;
    name: string;
    position: Position;
    age: number;
    archetype: string;
    draftScore: number;
    npv: number;
    dynastyScore: number;
    curve: {
      points: Array<{ yearOffset: number; season: number; value: number }>;
      npv: number;
    };
  }>;
  rookieBoard: Array<{
    playerId: string;
    name: string;
    position: Position;
    age: number;
    draftRound: number | null;
    draftScore: number;
    npv: number;
    dynastyScore: number;
    note: string;
  }>;
}

export interface AuctionState {
  leagueId: string;
  inflationRate: number;
  budgets: Array<{
    rosterId: string;
    name: string;
    startingBudget: number;
    spent: number;
    remaining: number;
    rosterSlotsFilled: number;
    rosterSlotsTotal: number;
  }>;
  bids: Array<{ playerId: string; rosterId: string; amount: number; contractYears?: number }>;
  contractRules: {
    maxLength: number;
    salaryCap: number | null;
    deadCapPctOnRelease: number;
    allowExtensions: boolean;
    franchiseTag: boolean;
    rolloverUnusedCap: boolean;
  };
  values: Array<{
    playerId: string;
    name: string;
    position: Position;
    age: number;
    draftScore: number;
    fairValue: number;
    inflatedValue: number;
    vorpShare: number;
  }>;
  nominations: Array<{
    playerId: string;
    name: string;
    reason: string;
    priority: number;
    kind: string;
  }>;
  userBudget: AuctionState['budgets'][number];
}

export interface MaxBidResult {
  playerId: string;
  maxBid: number;
  remainingBudget: number;
  slotsLeft: number;
  reserveForRest: number;
}

export interface ContractValuation {
  playerId: string;
  years: number;
  annualSalary: number;
  totalSalary: number;
  yearProjections: Array<{
    yearOffset: number;
    projectedValue: number;
    salary: number;
    surplus: number;
  }>;
  totalSurplus: number;
  deadCapOnRelease: number;
  note: string;
}

export interface CalibrationProposal {
  version: string;
  sampleSize: number;
  followRate: number;
  meanRankDelta: number;
  proposedBands: { greenMin: number; yellowMin: number; orangeMin: number };
  proposedWeights: { ceiling: number; archetype: number; value: number; risk: number };
  currentBands: { greenMin: number; yellowMin: number; orangeMin: number };
  currentWeights: { ceiling: number; archetype: number; value: number; risk: number };
  notes: string[];
  applied: boolean;
}

export interface CalibrationSummary {
  leagueId: string;
  outcomes: Array<{
    pickNumber: number;
    recommendedPlayerId: string | null;
    actualPlayerId: string;
    followed: boolean;
    actualRankAtPick: number | null;
  }>;
  rows: Array<{
    pickNumber: number;
    recommendedName: string | null;
    actualName: string;
    followed: boolean;
    rankDelta: number | null;
  }>;
  proposal: CalibrationProposal | null;
  activeBands: CalibrationProposal['currentBands'];
  activeWeights: CalibrationProposal['currentWeights'];
}

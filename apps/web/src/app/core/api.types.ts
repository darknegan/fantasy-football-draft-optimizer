export type Position = 'QB' | 'RB' | 'WR' | 'TE';
export type FactorGrade = 'elite' | 'green' | 'yellow' | 'orange' | 'red' | 'critical' | 'unknown';
export type StrategyTier = 'S' | 'A' | 'B' | 'C' | 'unrated';

export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  age: number;
  seasonsInLeague: number;
  status: string;
  positionalTop5FinishCount?: number;
  positionalTop8FinishCount?: number;
  positionalTop12FinishCount?: number;
  externalIds?: { sleeper?: string; gsis?: string };
  headshotUrl?: string | null;
  headshotThumbUrl?: string | null;
}

export interface GradedFactor {
  factorId: string;
  label: string;
  value: number | null;
  grade: FactorGrade;
  weight: number;
  benchmark?: number | null;
  category?: 'volume' | 'situational' | 'profile';
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
    rates?: {
      returnRate: number;
      injuryRate: number;
      boomRate: number;
      bustRate: number;
      fineRate: number;
    };
  };
  risk: {
    riskProfile: number;
    expectedGamesMissed: number;
    components?: {
      careerMissedRate: number;
      archetypeInjury: number;
      ageCurvePenalty: number;
      recentSeriousInjury: number;
    };
  };
  value: {
    valueScore: number;
    adpRoundPick: string;
    blendedRank: number;
    fseRank?: number | null;
    espnProjectionRank?: number | null;
    projectedRank?: number | null;
    usedMechanicalFallback?: boolean;
  };
  draftScore: number;
  weights?: {
    ceiling: number;
    archetype: number;
    value: number;
    risk: number;
  };
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
  formatScarcity?: number;
  /** Estimated P(still available at the user's next pick), 0–1. */
  survivalProbability?: number;
  reasons: RecommendationReason[];
  rank: number;
}

export interface RosterShape {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  flex: number;
  superflex: number;
  bench: number;
  totalStarters: number;
}

export interface BoardPlayer {
  player: Player;
  evaluation: PlayerEvaluation;
  recommendation?: PlayerRecommendation;
  drafted: boolean;
  target?: boolean;
  avoid?: boolean;
  /** Season-long projected fantasy points when present on the seed artifact. */
  projectedPoints?: number | null;
}

export interface ScoringSummary {
  plainLanguage: string[];
  variant: string;
  tePremium: boolean;
  superflex: boolean;
  formatNotes: string[];
  warnings: string[];
}

export interface ScoringProfile {
  id: string;
  name: string;
  variant: string;
  passYd: number;
  passTd: number;
  interception: number;
  rushYd: number;
  rushTd: number;
  reception: number;
  tePremiumBonus?: number;
  recYd: number;
  recTd: number;
  fumbleLost: number;
}

export interface League {
  id: string;
  userId: string;
  name: string;
  platform: 'sleeper' | 'manual';
  externalId?: string;
  type: string;
  draftType: string;
  draftPlayerPool?: 'all' | 'rookies';
  draftRounds?: number;
  teamCount: number;
  season: number;
  draftSlot?: number;
  strategyId?: string;
  sleeperDraftId?: string;
  scoring?: ScoringProfile;
  scoringSummary?: ScoringSummary;
  roster?: RosterShape;
  auctionBudget?: number;
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

export type ScoreBand = 'miss' | 'bubble' | 'playoff' | 'top3';

export interface ScoreHistogramBin {
  score: number;
  rate: number;
  band: ScoreBand;
}

export interface CommonRosterSlot {
  slot: 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX';
  playerId: string;
  playerName: string;
  position: Position;
  rate: number;
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
  bustRate?: number;
  positionMix: Record<Position, number>;
  sampleRosters: Array<{ score: number; playerIds: string[]; playerNames: string[] }>;
  scoreHistogram?: ScoreHistogramBin[];
  commonRoster?: CommonRosterSlot[];
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

export type DynastyMode = 'contend' | 'rebuild' | 'neutral';

export type DynastyTrend = 'rising' | 'hold' | 'watch' | 'sell';

export interface DynastyBoardRow {
  playerId: string;
  name: string;
  position: Position;
  age: number;
  seasonsInLeague?: number;
  archetype: string;
  draftScore: number;
  npv: number;
  dynastyScore: number;
  trend?: DynastyTrend;
  peakYearOffset?: number;
  contendWindow?: { start: number; end: number } | null;
  curve: {
    points: Array<{ yearOffset: number; season: number; value: number }>;
    npv: number;
  };
}

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
    originalRosterId?: string;
    estimatedValue: number;
    label: string;
  }>;
  ownedPickValue: number;
  board: DynastyBoardRow[];
  /** User roster (or demo seed) for the Roster & Dynasty table. */
  rosterBoard?: DynastyBoardRow[];
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
  summary?: {
    rosterCount: number;
    meanAge: number;
    agingRisk: number;
    contendWindow: { startSeason: number; endSeason: number; seasons: number };
    horizon: { startSeason: number; endSeason: number };
    pickCount: number;
    firsts: number;
    seconds: number;
  };
}

export interface AuctionSignedPlayer {
  playerId: string;
  name: string;
  position: Position;
  amount: number;
  contractYears: number;
  team: string;
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
    archetype?: string;
    overallRank?: number | null;
    /** Format-weighted VOR over the full board (same formula as the player board). */
    vor?: number | null;
    projectedPoints?: number | null;
    /** Scaled sleeperMCP auction `max` — pay-up-to for this scoring board. */
    ceilingValue?: number | null;
  }>;
  nominations: Array<{
    playerId: string;
    name: string;
    reason: string;
    priority: number;
    kind: string;
  }>;
  userBudget: AuctionState['budgets'][number];
  signedRoster?: AuctionSignedPlayer[];
  /** Signed contracts for every team in the auction. */
  teamRosters?: Array<{
    rosterId: string;
    name: string;
    players: AuctionSignedPlayer[];
  }>;
  lotNumber?: number;
  lotTotal?: number;
  cap?: number;
  /** sleeperMCP auction board selected for this league's scoring. */
  valueBoard?: { id: string; label: string } | null;
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
  proposedBands: {
    eliteMin: number;
    greenMin: number;
    yellowMin: number;
    orangeMin: number;
    redMin: number;
  };
  proposedWeights: { ceiling: number; archetype: number; value: number; risk: number };
  currentBands: {
    eliteMin: number;
    greenMin: number;
    yellowMin: number;
    orangeMin: number;
    redMin: number;
  };
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

export type GameLogTone = 'good' | 'avg' | 'bad' | 'neutral';

export interface GameLogStatLine {
  att: number | null;
  cmp?: number | null;
  yd: number | null;
  td: number | null;
  int?: number | null;
  ypc?: number | null;
  tgt?: number | null;
  rec?: number | null;
}

export interface GameLogWeek {
  week: number;
  label: string;
  opponent: string | null;
  isAway: boolean;
  team: string | null;
  date: string | null;
  fpts: number | null;
  snapPct: number | null;
  rank: number | null;
  passing: GameLogStatLine;
  rushing: GameLogStatLine;
  receiving: GameLogStatLine;
  tone: GameLogTone;
}

export interface PlayerGameLog {
  sleeperId: string;
  season: number;
  seasonType: string;
  scoring: 'ppr' | 'half_ppr' | 'std';
  weeks: GameLogWeek[];
  totals: {
    games: number;
    fpts: number | null;
    fptsPerGame: number | null;
    snapPct: number | null;
    rank: number | null;
    passing: GameLogStatLine;
    rushing: GameLogStatLine;
    receiving: GameLogStatLine;
  } | null;
  source: 'sleeper';
}

export interface PlayerGameLogResponse {
  playerId: string;
  sleeperId: string;
  headshotUrl: string | null;
  availableSeasons: number[];
  gameLog: PlayerGameLog;
  scoring: 'ppr' | 'half_ppr' | 'std';
}

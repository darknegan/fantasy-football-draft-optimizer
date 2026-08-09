export type Position = 'QB' | 'RB' | 'WR' | 'TE';

export type FactorGrade = 'green' | 'yellow' | 'orange' | 'red' | 'unknown';

export type FactorDirection = 'higherBetter' | 'lowerBetter';

export type StrategyId =
  | 'balanced'
  | 'hero_rb'
  | 'hero_wr'
  | 'double_hero_rb'
  | 'double_hero_wr'
  | 'robust_rb'
  | 'zero_rb'
  | 'elite_qb'
  | 'elite_te';

export type StrategyTier = 'S' | 'A' | 'B' | 'C' | 'unrated';

export type DraftSlotTier = 'S' | 'A' | 'B' | 'C' | 'unrated';

export type ArchetypeId =
  | 'BREAKOUT_CANDIDATE'
  | 'PROVEN_BREAKOUT_CANDIDATE'
  | 'TRUSTY_VETERAN'
  | 'IN_THEIR_PRIME'
  | 'PRIME_WR1'
  | 'PRIME_WR2';

export type LeagueType = 'redraft' | 'dynasty' | 'auction';

export type DraftType = 'snake' | 'auction' | 'linear' | 'rookie';

export type Platform = 'sleeper' | 'manual';

export type PlayerStatus = 'active' | 'injured' | 'suspended' | 'inactive';

export type InjurySeverity = 'minimal' | 'some' | 'concerned' | 'serious';

export type ScoringVariant = 'standard' | 'half_ppr' | 'ppr';

export type SecondaryTargetCompetition = 'more' | 'same' | 'less' | 'unknown';

export interface FactorDefinition {
  id: string;
  label: string;
  category: 'volume' | 'situational' | 'profile';
  direction: FactorDirection;
  benchmark: number;
  /** When true, grade uses categorical competition labels instead of ratio bands. */
  categorical?: 'secondaryTargetCompetition' | 'injuryConcern' | 'archetypeGrade';
}

export interface GradingBands {
  greenMin: number;
  yellowMin: number;
  orangeMin: number;
}

export interface PositionBenchmarkConfig {
  position: Position;
  season: number;
  factors: FactorDefinition[];
  bands: GradingBands;
  provisional?: boolean;
}

export interface Player {
  id: string;
  externalIds: { sleeper?: string; gsis?: string };
  name: string;
  team: string;
  position: Position;
  age: number;
  birthDate?: string;
  seasonsInLeague: number;
  draftYear: number;
  draftRound: number | null;
  status: PlayerStatus;
  hasPositionalTop12Finish: boolean;
  isClearWr1?: boolean;
}

export interface FactorInput {
  factorId: string;
  value: number | null;
  /** Override for categorical factors */
  categorical?: SecondaryTargetCompetition | InjurySeverity | ArchetypeId | null;
}

export interface GradedFactor {
  factorId: string;
  label: string;
  value: number | null;
  grade: FactorGrade;
  weight: number;
  note?: string;
}

export interface CeilingResult {
  ceilingScore: number | null;
  factors: GradedFactor[];
  knownFactors: number;
  confidenceScore: number;
  provisional: boolean;
  failsTargetShareGate?: boolean;
}

export interface ArchetypeRates {
  returnRate: number;
  injuryRate: number;
  boomRate: number;
  bustRate: number;
  fineRate: number;
}

export interface ArchetypeResult {
  archetype: ArchetypeId;
  rates: ArchetypeRates;
  archetypeEv: number;
}

export interface RiskResult {
  riskProfile: number;
  expectedGamesMissed: number;
  components: {
    careerMissedRate: number;
    archetypeInjury: number;
    ageCurvePenalty: number;
    recentSeriousInjury: number;
  };
}

export interface ValueResult {
  valueScore: number;
  adpOverallPick: number;
  blendedRank: number;
  fseRank: number | null;
  espnProjectionRank: number | null;
  adpRoundPick: string;
}

export interface DraftScoreWeights {
  ceiling: number;
  archetype: number;
  value: number;
  risk: number;
}

export interface PlayerEvaluation {
  playerId: string;
  ceiling: CeilingResult;
  archetype: ArchetypeResult;
  risk: RiskResult;
  value: ValueResult;
  draftScore: number;
  weights: DraftScoreWeights;
}

export interface RoundTarget {
  round: number;
  primary: Position[];
  secondary: Position[];
  avoid: Position[];
  note: string;
}

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  definition: string;
  tier: StrategyTier;
  rounds: RoundTarget[];
}

export interface DraftSlotInfo {
  slot: number;
  tier: DraftSlotTier;
  pickNumbers: number[];
}

export interface ScoringProfile {
  id: string;
  name: string;
  variant: ScoringVariant;
  passYd: number;
  passTd: number;
  interception: number;
  rushYd: number;
  rushTd: number;
  reception: number;
  /** Extra PPR for TE only (TE premium). */
  tePremiumBonus?: number;
  recYd: number;
  recTd: number;
  fumbleLost: number;
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

export interface League {
  id: string;
  name: string;
  platform: Platform;
  externalId?: string;
  type: LeagueType;
  draftType: DraftType;
  teamCount: number;
  season: number;
  scoring: ScoringProfile;
  roster: RosterShape;
  draftSlot?: number;
  strategyId?: StrategyId;
  sleeperDraftId?: string;
  sleeperUserId?: string;
  /** Dynasty contend / rebuild tilt. */
  dynastyMode?: DynastyMode;
  /** Auction starting budget per team. */
  auctionBudget?: number;
  /** Configurable multi-year contract rules for auction leagues. */
  contractRules?: ContractRules;
}

export interface PickEvent {
  pickNumber: number;
  round: number;
  slot: number;
  playerId: string | null;
  rosterId: string;
  pickedAt: string;
  source: 'sleeper' | 'manual';
}

export type DraftSyncMode = 'polling' | 'manual' | 'hybrid' | 'degraded';

export interface DraftState {
  leagueId: string;
  draftId: string;
  status: 'pre_draft' | 'drafting' | 'paused' | 'complete';
  currentPick: number;
  picks: PickEvent[];
  availablePlayerIds: string[];
  userRosterId: string;
  lastSyncedAt: string | null;
  syncMode: DraftSyncMode;
  /** User-visible banner for failure modes (429, unreachable, etc.). */
  syncBanner?: string | null;
  lastPickedUpstream?: number | null;
  picksUntilUser?: number | null;
}

export interface PositionNeed {
  position: Position;
  filled: number;
  required: number;
  flexEligible: boolean;
  urgency: number;
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

// --- Dynasty ---

export type DynastyMode = 'contend' | 'rebuild' | 'neutral';

export interface MultiYearPoint {
  yearOffset: number;
  season: number;
  value: number;
  productionWeight: number;
  assetWeight: number;
}

export interface MultiYearCurve {
  playerId: string;
  points: MultiYearPoint[];
  npv: number;
  peakYearOffset: number;
  contendWindow: { start: number; end: number } | null;
}

export interface DraftPickAsset {
  id: string;
  season: number;
  round: number;
  originalRosterId: string;
  ownerRosterId: string;
  estimatedValue: number;
  label: string;
}

export interface RosterAgeBucket {
  label: string;
  minAge: number;
  maxAge: number;
  count: number;
  playerIds: string[];
}

export interface RosterAgeCurve {
  meanAge: number;
  medianAge: number;
  buckets: RosterAgeBucket[];
  contendScore: number;
  rebuildScore: number;
}

// --- Auction ---

export interface ContractRules {
  maxLength: number;
  salaryCap: number | null;
  deadCapPctOnRelease: number;
  allowExtensions: boolean;
  franchiseTag: boolean;
  rolloverUnusedCap: boolean;
}

export interface AuctionTeamBudget {
  rosterId: string;
  name: string;
  startingBudget: number;
  spent: number;
  remaining: number;
  rosterSlotsFilled: number;
  rosterSlotsTotal: number;
}

export interface AuctionPlayerValue {
  playerId: string;
  fairValue: number;
  inflatedValue: number;
  vorpShare: number;
}

export interface AuctionBid {
  playerId: string;
  rosterId: string;
  amount: number;
  contractYears?: number;
  nominatedAt?: string;
}

export interface MaxBidResult {
  playerId: string;
  maxBid: number;
  remainingBudget: number;
  slotsLeft: number;
  reserveForRest: number;
}

export interface NominationSuggestion {
  playerId: string;
  reason: string;
  priority: number;
  kind: 'drain' | 'target_cheap' | 'value';
}

export interface ContractYearProjection {
  yearOffset: number;
  projectedValue: number;
  salary: number;
  surplus: number;
}

export interface ContractValuation {
  playerId: string;
  years: number;
  annualSalary: number;
  totalSalary: number;
  yearProjections: ContractYearProjection[];
  totalSurplus: number;
  deadCapOnRelease: number;
  note: string;
}

// --- Calibration ---

export interface DraftOutcome {
  id: string;
  leagueId: string;
  pickNumber: number;
  recommendedPlayerId: string | null;
  actualPlayerId: string;
  recommendedRank: number | null;
  actualRankAtPick: number | null;
  followed: boolean;
  recordedAt: string;
}

export interface RecVsActualRow {
  pickNumber: number;
  recommendedPlayerId: string | null;
  recommendedName: string | null;
  actualPlayerId: string;
  actualName: string;
  followed: boolean;
  rankDelta: number | null;
}

export interface CalibrationProposal {
  version: string;
  sampleSize: number;
  followRate: number;
  meanRankDelta: number;
  proposedBands: GradingBands;
  proposedWeights: DraftScoreWeights;
  currentBands: GradingBands;
  currentWeights: DraftScoreWeights;
  notes: string[];
  applied: boolean;
}

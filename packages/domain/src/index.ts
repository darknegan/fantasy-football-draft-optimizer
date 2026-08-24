import type { InitialsColor, UserPreferences } from './user-preferences.js';

export type Position = 'QB' | 'RB' | 'WR' | 'TE';

export type FactorGrade = 'elite' | 'green' | 'yellow' | 'orange' | 'red' | 'critical' | 'unknown';

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
  | 'ELITE'
  | 'IN_THEIR_PRIME'
  | 'TRUSTY_VETERAN'
  | 'VETERAN';

export type LeagueType = 'redraft' | 'dynasty' | 'auction';

export type DraftType = 'snake' | 'auction' | 'linear' | 'rookie';

/** Which players are eligible in the draft room board. */
export type DraftPlayerPool = 'all' | 'rookies';

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
  eliteMin: number;
  greenMin: number;
  yellowMin: number;
  orangeMin: number;
  redMin: number;
}

export interface PositionBenchmarkConfig {
  position: Position;
  season: number;
  factors: FactorDefinition[];
  volumeBands: GradingBands;
  rankBands: GradingBands;
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
  /** Career top-5 finishes at the player's position (season fantasy-point rank). */
  positionalTop5FinishCount: number;
  /** Career top-8 finishes at the player's position (season fantasy-point rank). */
  positionalTop8FinishCount: number;
  /** Career top-12 finishes at the player's position (season fantasy-point rank). */
  positionalTop12FinishCount: number;
  /**
   * @deprecated Prefer positionalTop12FinishCount. Kept optional for older fixtures.
   */
  hasPositionalTop12Finish?: boolean;
  /**
   * WR/RB only: rank among same-team, same-position teammates by the position's primary
   * volume stat (targets for WR, touches for RB). 1 = the team's clear lead option — a
   * true alpha receiver or a bell-cow back, not a committee/complementary piece.
   * QB has no analogous "QB2" within one offense; TE's version of this distinction is
   * captured by computeCeilingScore's failsTargetShareGate instead, a different mechanism
   * for the same idea.
   */
  teamPositionRank?: number | null;
}

export interface FactorInput {
  factorId: string;
  value: number | null;
  /** Override for categorical factors */
  categorical?: SecondaryTargetCompetition | InjurySeverity | ArchetypeId | null;
  /**
   * Where this value came from — e.g. 'measured', 'stale:team_changed',
   * 'missing:no_prior_season', 'computed:classifyArchetype'. Optional and
   * free-form: hand-authored fixtures have no provenance to report, and
   * sleeperMCP's provenance vocabulary may grow without a type change here.
   * Was the blocking gap for importing sleeperMCP's player_factors.json —
   * without it, real gaps (a player who changed teams, a factor nobody has
   * licensed) would land as ordinary numbers indistinguishable from a
   * confident measurement.
   */
  provenance?: string;
}

export interface GradedFactor {
  factorId: string;
  label: string;
  value: number | null;
  grade: FactorGrade;
  weight: number;
  /** Benchmark from the position config — used on Player Detail factor rows. */
  benchmark?: number | null;
  category?: 'volume' | 'situational' | 'profile';
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
  /** Mechanical fallback rank when neither licensed source is available. See ValueInput.projectedRank. */
  projectedRank: number | null;
  /** True when valueScore was computed off projectedRank rather than a licensed source — see evaluateValue. */
  usedMechanicalFallback: boolean;
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

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  timeZone: string;
  initialsColor: InitialsColor;
  passwordChangedAt?: string | null;
  preferences: UserPreferences;
  leagueCount?: number;
}

export type {
  AdpNotation,
  BoardDensity,
  DraftLeadTime,
  InitialsColor,
  LandingScreen,
  NotificationPreferences,
  UserPreferences,
} from './user-preferences.js';
export {
  DEFAULT_USER_PREFERENCES,
  isValidTimeZone,
  mergeUserPreferences,
  normalizeInitialsColor,
} from './user-preferences.js';

export interface League {
  id: string;
  /** DraftLab account that owns this league connection. */
  userId: string;
  name: string;
  platform: Platform;
  externalId?: string;
  type: LeagueType;
  draftType: DraftType;
  /** When `rookies`, the draft room only lists first-year / current-class players. */
  draftPlayerPool?: DraftPlayerPool;
  /** Total rounds for snake/linear draft rooms (from Sleeper draft settings when linked). */
  draftRounds?: number;
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
  /** Draft-pick-timing urgency: how few quality options remain before the user's next pick. */
  scarcityUrgency: number;
  /** League-format positional scarcity: this position's starting-slot demand vs. its
   * draftable pool in this league's actual roster/scoring settings, relative to the other
   * three positions. A different, longer-lived signal than scarcityUrgency — doesn't change
   * as the draft progresses, only as the league's format does. */
  formatScarcity: number;
  /** Estimated P(still available at the user's next pick), 0–1. */
  survivalProbability: number;
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
  /** Season-long projected fantasy points when present on the seed artifact. */
  projectedPoints?: number | null;
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
  /** Scaled pay-up-to from the sleeperMCP auction board (`max`). */
  ceilingValue?: number;
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

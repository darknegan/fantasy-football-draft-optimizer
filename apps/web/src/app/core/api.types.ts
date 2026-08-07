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

export interface League {
  id: string;
  name: string;
  platform: 'sleeper' | 'manual';
  type: string;
  draftType: string;
  teamCount: number;
  season: number;
  draftSlot?: number;
  strategyId?: string;
  sleeperDraftId?: string;
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
  ranking: Array<{ strategyId: string; meanRosterScore: number; topThirdRate: number; rank: number }>;
}

export interface CheatSheetGroup {
  position: Position;
  tiers: Array<{
    tier: string;
    label: string;
    players: Array<{
      id: string;
      name: string;
      position: Position;
      draftScore: number;
      ceilingScore: number | null;
      provisional: boolean;
      adpRoundPick: string;
      target?: boolean;
      avoid?: boolean;
    }>;
  }>;
}

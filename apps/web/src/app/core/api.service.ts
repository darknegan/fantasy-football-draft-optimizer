import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ArtifactMeta } from './artifact-provenance';
import type {
  AdherenceResult,
  AuctionState,
  BoardPlayer,
  CalibrationProposal,
  CalibrationSummary,
  CompareStrategiesResult,
  ContractValuation,
  DraftRecap,
  DraftSlotInfo,
  DraftState,
  DynastyMode,
  DynastyOverview,
  League,
  MaxBidResult,
  Player,
  PlayerEvaluation,
  PlayerGameLogResponse,
  ScoringSummary,
  StrategyDefinition,
  StrategySimResult,
} from './api.types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  health() {
    return this.http.get<{
      ok: boolean;
      artifacts?: {
        factors: ArtifactMeta;
        benchmarks: ArtifactMeta;
      };
    }>('/api/health');
  }

  players() {
    return this.http.get<Array<{ player: Player; evaluation: PlayerEvaluation }>>('/api/players');
  }

  player(id: string) {
    return this.http.get<{ player: Player; evaluation: PlayerEvaluation }>(`/api/players/${id}`);
  }

  playerGameLog(
    id: string,
    opts: { season?: number; seasonType?: string; scoring?: string; leagueId?: string } = {},
  ) {
    const params: Record<string, string> = {};
    if (opts.season != null) params['season'] = String(opts.season);
    if (opts.seasonType) params['season_type'] = opts.seasonType;
    if (opts.scoring) params['scoring'] = opts.scoring;
    if (opts.leagueId) params['leagueId'] = opts.leagueId;
    return this.http.get<PlayerGameLogResponse>(`/api/players/${id}/game-log`, { params });
  }

  leagues() {
    return this.http.get<League[]>('/api/leagues');
  }

  league(id: string) {
    return this.http.get<League & { scoringSummary: ScoringSummary }>(`/api/leagues/${id}`);
  }

  board(leagueId: string) {
    return this.http.get<BoardPlayer[]>(`/api/leagues/${leagueId}/board`);
  }

  draft(leagueId: string) {
    return this.http.get<DraftState>(`/api/leagues/${leagueId}/draft`);
  }

  strategies() {
    return this.http.get<StrategyDefinition[]>('/api/strategies');
  }

  draftSlots() {
    return this.http.get<DraftSlotInfo[]>('/api/draft-slots');
  }

  createManualLeague(body: Record<string, unknown>) {
    return this.http.post<{
      league: League;
      scoringSummary: ScoringSummary;
      requiresConfirmation: boolean;
      message?: string;
    }>('/api/leagues/manual', body);
  }

  connectSleeper(username: string, season?: number) {
    return this.http.post<{
      user: { username: string; display_name: string };
      leagues: Array<League & { scoringSummary: ScoringSummary }>;
    }>('/api/leagues/sleeper/connect', { username, season });
  }

  updateLeague(id: string, body: Partial<League>) {
    return this.http.patch<League>(`/api/leagues/${id}`, body);
  }

  applyPick(
    leagueId: string,
    body: { pickNumber: number; round: number; slot: number; playerId: string; rosterId?: string },
  ) {
    return this.http.post<{ draft: DraftState; board: BoardPlayer[]; adherence: AdherenceResult }>(
      `/api/leagues/${leagueId}/draft/picks`,
      body,
    );
  }

  scoringPresets() {
    return this.http.get<Array<{ id: string; name: string; variant: string; tePremiumBonus?: number }>>(
      '/api/scoring-presets',
    );
  }

  setFlag(leagueId: string, playerId: string, kind: 'target' | 'avoid', value: boolean) {
    return this.http.post<{ ok: boolean; targets: string[]; avoids: string[] }>(
      `/api/leagues/${leagueId}/flags`,
      { playerId, kind, value },
    );
  }

  simulate(
    leagueId: string,
    body: {
      strategyId?: string;
      iterations?: number;
      rounds?: number;
      draftSlot?: number;
      adpVarianceRatio?: number;
      adpVarianceFloor?: number;
    } = {},
  ) {
    return this.http.post<StrategySimResult>(`/api/leagues/${leagueId}/simulate`, body);
  }

  compareStrategies(
    leagueId: string,
    body: {
      strategyIds?: string[];
      iterations?: number;
      rounds?: number;
      draftSlot?: number;
      adpVarianceRatio?: number;
      adpVarianceFloor?: number;
    } = {},
  ) {
    return this.http.post<CompareStrategiesResult>(`/api/leagues/${leagueId}/compare-strategies`, body);
  }

  scoringSummary(leagueId: string) {
    return this.http.get<ScoringSummary>(`/api/leagues/${leagueId}/scoring-summary`);
  }

  adherence(leagueId: string) {
    return this.http.get<AdherenceResult>(`/api/leagues/${leagueId}/adherence`);
  }

  recap(leagueId: string) {
    return this.http.get<DraftRecap>(`/api/leagues/${leagueId}/recap`);
  }

  setManualMode(leagueId: string) {
    return this.http.post<DraftState>(`/api/leagues/${leagueId}/draft/manual-mode`, {});
  }

  startPolling(leagueId: string) {
    return this.http.post<DraftState>(`/api/leagues/${leagueId}/draft/start-polling`, {});
  }

  recalculate(leagueId: string) {
    return this.http.post<{ leagueId: string; scoring: ScoringSummary }>(
      `/api/leagues/${leagueId}/recalculate`,
      {},
    );
  }

  dynasty(leagueId: string) {
    return this.http.get<DynastyOverview>(`/api/leagues/${leagueId}/dynasty`);
  }

  setDynastyMode(leagueId: string, mode: DynastyMode) {
    return this.http.post<DynastyOverview>(`/api/leagues/${leagueId}/dynasty/mode`, { mode });
  }

  auctionState(leagueId: string) {
    return this.http.get<AuctionState>(`/api/leagues/${leagueId}/auction/values`);
  }

  auctionBid(leagueId: string, body: { playerId: string; amount: number; rosterId?: string; contractYears?: number }) {
    return this.http.post<AuctionState>(`/api/leagues/${leagueId}/auction/bid`, body);
  }

  auctionMaxBid(leagueId: string, playerId: string) {
    return this.http.get<MaxBidResult>(`/api/leagues/${leagueId}/auction/max-bid`, {
      params: { playerId },
    });
  }

  auctionContractPreview(
    leagueId: string,
    body: { playerId: string; annualSalary: number; years: number },
  ) {
    return this.http.post<ContractValuation>(`/api/leagues/${leagueId}/auction/contract-preview`, body);
  }

  setContractRules(leagueId: string, body: Record<string, unknown>) {
    return this.http.put(`/api/leagues/${leagueId}/auction/contract-rules`, body);
  }

  calibration(leagueId: string) {
    return this.http.get<CalibrationSummary>(`/api/leagues/${leagueId}/calibration`);
  }

  proposeCalibration(leagueId: string) {
    return this.http.post<CalibrationProposal>(`/api/leagues/${leagueId}/calibration/propose`, {});
  }

  applyCalibration(leagueId: string) {
    return this.http.post<CalibrationProposal>(`/api/leagues/${leagueId}/calibration/apply`, {});
  }
}

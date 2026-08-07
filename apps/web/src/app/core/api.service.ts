import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AdherenceResult,
  BoardPlayer,
  CheatSheetGroup,
  CompareStrategiesResult,
  DraftRecap,
  DraftSlotInfo,
  DraftState,
  League,
  Player,
  PlayerEvaluation,
  ScoringSummary,
  StrategyDefinition,
  StrategySimResult,
} from './api.types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  health() {
    return this.http.get<{ ok: boolean }>('/api/health');
  }

  players() {
    return this.http.get<Array<{ player: Player; evaluation: PlayerEvaluation }>>('/api/players');
  }

  player(id: string) {
    return this.http.get<{ player: Player; evaluation: PlayerEvaluation }>(`/api/players/${id}`);
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
    body: { pickNumber: number; round: number; slot: number; playerId: string },
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

  simulate(leagueId: string, body: { strategyId?: string; iterations?: number; rounds?: number } = {}) {
    return this.http.post<StrategySimResult>(`/api/leagues/${leagueId}/simulate`, body);
  }

  compareStrategies(leagueId: string, body: { strategyIds?: string[]; iterations?: number; rounds?: number } = {}) {
    return this.http.post<CompareStrategiesResult>(`/api/leagues/${leagueId}/compare-strategies`, body);
  }

  cheatSheet(leagueId: string) {
    return this.http.get<CheatSheetGroup[]>(`/api/leagues/${leagueId}/cheat-sheet`);
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
}

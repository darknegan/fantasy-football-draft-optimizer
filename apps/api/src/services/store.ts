import type {
  BoardPlayer,
  DraftState,
  League,
  PickEvent,
  PlayerEvaluation,
  StrategyId,
} from '@draftlab/domain';
import { evaluatePlayer } from '@draftlab/evaluation-engine';
import { createManualLeague, DEFAULT_ROSTER_12, SCORING_PRESETS } from '@draftlab/integrations';
import { recommendPlayers } from '@draftlab/recommendation-engine';
import { getDraftSlotInfo, listStrategies } from '@draftlab/strategy-engine';
import { SEED_PLAYERS } from '../data/seed-players.js';

export class AppStore {
  private readonly evaluations = new Map<string, PlayerEvaluation>();
  private readonly leagues = new Map<string, League>();
  private readonly drafts = new Map<string, DraftState>();
  private readonly targets = new Map<string, Set<string>>();
  private readonly avoids = new Map<string, Set<string>>();

  constructor() {
    for (const seed of SEED_PLAYERS) {
      const evaluation = evaluatePlayer({
        player: seed.player,
        factors: seed.factors,
        value: {
          adpRoundPick: seed.market.adpRoundPick,
          fseRank: seed.market.fseRank,
          espnProjectionRank: seed.market.espnProjectionRank,
          teamCount: 12,
        },
        risk: seed.risk,
      });
      this.evaluations.set(seed.player.id, evaluation);
    }

    const demo = createManualLeague({
      name: 'Demo 12-Team PPR',
      teamCount: 12,
      season: 2025,
      scoring: SCORING_PRESETS[0]!,
      roster: DEFAULT_ROSTER_12,
      draftSlot: 3,
      strategyId: 'balanced',
    });
    demo.id = 'demo-league';
    this.leagues.set(demo.id, demo);
    this.drafts.set(demo.id, this.createEmptyDraft(demo.id));
  }

  listPlayers() {
    return SEED_PLAYERS.map((s) => s.player);
  }

  getPlayer(id: string) {
    return SEED_PLAYERS.find((s) => s.player.id === id)?.player;
  }

  getEvaluation(id: string) {
    return this.evaluations.get(id);
  }

  listEvaluations() {
    return [...this.evaluations.values()];
  }

  listLeagues() {
    return [...this.leagues.values()];
  }

  getLeague(id: string) {
    return this.leagues.get(id);
  }

  upsertLeague(league: League) {
    this.leagues.set(league.id, league);
    if (!this.drafts.has(league.id)) {
      this.drafts.set(league.id, this.createEmptyDraft(league.id));
    }
    return league;
  }

  updateLeague(id: string, patch: Partial<League>) {
    const existing = this.leagues.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, id };
    this.leagues.set(id, next);
    return next;
  }

  getDraft(leagueId: string) {
    return this.drafts.get(leagueId);
  }

  getBoard(leagueId: string): BoardPlayer[] {
    const league = this.leagues.get(leagueId);
    const draft = this.drafts.get(leagueId);
    if (!league || !draft) return [];

    const draftedIds = new Set(draft.picks.filter((p) => p.playerId).map((p) => p.playerId!));
    const userRoster = draft.picks
      .filter((p) => p.rosterId === draft.userRosterId && p.playerId)
      .map((p) => this.getPlayer(p.playerId!)!)
      .filter(Boolean);

    const available = SEED_PLAYERS.filter((s) => !draftedIds.has(s.player.id)).map((s) => ({
      player: s.player,
      evaluation: this.evaluations.get(s.player.id)!,
    }));

    const round = Math.floor((draft.currentPick - 1) / league.teamCount) + 1;
    const slotInfo = getDraftSlotInfo(league.draftSlot ?? 1, league.teamCount, 15);
    const nextUserPick = slotInfo.pickNumbers.find((n) => n >= draft.currentPick) ?? draft.currentPick;
    const picksUntilNext = Math.max(0, nextUserPick - draft.currentPick);

    const strategyId = (league.strategyId ?? 'balanced') as StrategyId;
    const recs = recommendPlayers({
      strategyId,
      round,
      picksUntilNext,
      userRoster,
      rosterShape: league.roster,
      available,
    });
    const recById = new Map(recs.map((r) => [r.playerId, r]));
    const targetSet = this.targets.get(leagueId) ?? new Set();
    const avoidSet = this.avoids.get(leagueId) ?? new Set();

    return SEED_PLAYERS.map((s) => ({
      player: s.player,
      evaluation: this.evaluations.get(s.player.id)!,
      recommendation: recById.get(s.player.id),
      drafted: draftedIds.has(s.player.id),
      target: targetSet.has(s.player.id),
      avoid: avoidSet.has(s.player.id),
    })).sort((a, b) => {
      const ar = a.recommendation?.contextualScore ?? a.evaluation.draftScore;
      const br = b.recommendation?.contextualScore ?? b.evaluation.draftScore;
      return br - ar;
    });
  }

  applyPick(leagueId: string, pick: Omit<PickEvent, 'pickedAt'> & { pickedAt?: string }) {
    const draft = this.drafts.get(leagueId);
    if (!draft) return null;

    const event: PickEvent = {
      ...pick,
      pickedAt: pick.pickedAt ?? new Date().toISOString(),
    };

    const existingIdx = draft.picks.findIndex((p) => p.pickNumber === event.pickNumber);
    if (existingIdx >= 0) draft.picks[existingIdx] = event;
    else draft.picks.push(event);

    draft.picks.sort((a, b) => a.pickNumber - b.pickNumber);
    draft.currentPick = Math.max(draft.currentPick, event.pickNumber + 1);
    draft.availablePlayerIds = draft.availablePlayerIds.filter((id) => id !== event.playerId);
    draft.lastSyncedAt = new Date().toISOString();
    draft.status = 'drafting';
    return draft;
  }

  setStrategy(leagueId: string, strategyId: StrategyId) {
    return this.updateLeague(leagueId, { strategyId });
  }

  setFlag(leagueId: string, playerId: string, kind: 'target' | 'avoid', value: boolean) {
    const map = kind === 'target' ? this.targets : this.avoids;
    if (!map.has(leagueId)) map.set(leagueId, new Set());
    const set = map.get(leagueId)!;
    if (value) set.add(playerId);
    else set.delete(playerId);
  }

  strategies() {
    return listStrategies();
  }

  private createEmptyDraft(leagueId: string): DraftState {
    return {
      leagueId,
      draftId: `draft-${leagueId}`,
      status: 'pre_draft',
      currentPick: 1,
      picks: [],
      availablePlayerIds: SEED_PLAYERS.map((s) => s.player.id),
      userRosterId: 'roster-user',
      lastSyncedAt: null,
      syncMode: 'manual',
    };
  }
}

export const store = new AppStore();

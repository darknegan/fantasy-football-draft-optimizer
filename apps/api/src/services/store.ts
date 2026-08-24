import type {
  BoardPlayer,
  ContractRules,
  DraftState,
  DynastyMode,
  League,
  PickEvent,
  PlayerEvaluation,
  Position,
  StrategyId,
} from '@draftlab/domain';
import { withHeadshot } from '@draftlab/integrations';
import {
  applyBidToBudgets,
  applyInflation,
  computeDollarValues,
  computeInflationRate,
  computeMaxBid,
  DEFAULT_CONTRACT_RULES,
  dollarValuesFromAuctionBoard,
  selectAuctionBoard,
  suggestNominations,
  valueContract,
  vorpFromEvaluation,
  type AuctionValuesArtifact,
} from '@draftlab/auction-engine';
import { buildRecVsActual, proposeCalibration, recordOutcome } from '@draftlab/calibration-engine';
import {
  applyDynastyModeToRecommendations,
  buildMultiYearCurve,
  buildRosterAgeCurve,
  buildRookieBoard,
  dynastyCompositeScore,
  ownedPickValue,
  seedPickAssets,
} from '@draftlab/dynasty-engine';
import { adpToOverallPick, evaluatePlayer } from '@draftlab/evaluation-engine';
import {
  createManualLeague,
  DEFAULT_ROSTER_12,
  scoringConfirmation,
  SCORING_PRESETS,
  summarizeScoring,
} from '@draftlab/integrations';
import { recommendPlayers } from '@draftlab/recommendation-engine';
import {
  compareStrategies,
  getDraftSlotInfo,
  listStrategies,
  picksFromEvents,
  scoreAdherence,
  simulateStrategy,
  type SimPlayer,
} from '@draftlab/strategy-engine';
import { buildCheatSheet, computeVor, projectUserPickProgress, resolveVorScoringFormat } from '@draftlab/tiers';
import type { SeedPlayer } from '../data/seed-players.js';
import { FormatState } from './format-state.js';
import { buildRecap } from './recap.js';

type CompareCacheEntry = {
  at: number;
  value: ReturnType<typeof compareStrategies>;
};

export class AppStore {
  private readonly seeds: SeedPlayer[];
  private readonly auctionBoards: AuctionValuesArtifact[];
  /** Global catalog evaluations (public /api/players). */
  private readonly evaluations = new Map<string, PlayerEvaluation>();
  /** Per-league evaluation caches — recalculate/calibration must not clobber other leagues. */
  private readonly leagueEvaluations = new Map<string, Map<string, PlayerEvaluation>>();
  private readonly leagues = new Map<string, League>();
  private readonly drafts = new Map<string, DraftState>();
  private readonly targets = new Map<string, Set<string>>();
  private readonly avoids = new Map<string, Set<string>>();
  /** Short-lived compare results — re-runs with the same knobs are common in the simulator UI. */
  private readonly compareCache = new Map<string, CompareCacheEntry>();
  readonly formats = new FormatState();

  constructor(
    seeds: SeedPlayer[],
    opts?: { seedDemoUserId?: string; auctionBoards?: AuctionValuesArtifact[] },
  ) {
    this.seeds = seeds;
    this.auctionBoards = opts?.auctionBoards ?? [];
    for (const seed of this.seeds) {
      const evaluation = evaluatePlayer({
        player: seed.player,
        factors: seed.factors,
        value: {
          adpRoundPick: seed.market.adpRoundPick,
          fseRank: seed.market.fseRank,
          espnProjectionRank: seed.market.espnProjectionRank,
          projectedRank: seed.market.projectedRank,
          teamCount: 12,
        },
        risk: seed.risk,
      });
      this.evaluations.set(seed.player.id, evaluation);
    }

    if (opts?.seedDemoUserId) {
      this.seedDemoLeagues(opts.seedDemoUserId);
    }
  }

  /** Dev-only demos attached to a dedicated demo user (SEED_DEMO_USER). */
  seedDemoLeagues(userId: string) {
    const demo = createManualLeague({
      userId,
      name: 'Demo 12-Team PPR',
      teamCount: 12,
      season: 2025,
      scoring: SCORING_PRESETS[0]!,
      roster: DEFAULT_ROSTER_12,
      draftSlot: 3,
      strategyId: 'balanced',
    });
    this.leagues.set(demo.id, demo);
    this.drafts.set(demo.id, this.createEmptyDraft(demo.id));
    this.recalculateForLeague(demo.id);

    const dynasty = createManualLeague({
      userId,
      name: 'Demo Dynasty Superflex',
      type: 'dynasty',
      draftType: 'rookie',
      teamCount: 12,
      season: 2025,
      scoring: SCORING_PRESETS[4] ?? SCORING_PRESETS[0]!,
      roster: {
        qb: 1,
        rb: 2,
        wr: 3,
        te: 1,
        flex: 1,
        superflex: 1,
        bench: 8,
        totalStarters: 9,
      },
      draftSlot: 4,
      strategyId: 'balanced',
      dynastyMode: 'rebuild',
    });
    this.leagues.set(dynasty.id, dynasty);
    this.drafts.set(dynasty.id, this.createEmptyDraft(dynasty.id));
    this.formats.ensureDynasty(dynasty.id, 'rebuild');
    this.formats.pickAssets.set(
      dynasty.id,
      seedPickAssets(dynasty.teamCount, dynasty.season, 'roster-user'),
    );
    this.recalculateForLeague(dynasty.id);

    const auction = createManualLeague({
      userId,
      name: 'Demo Auction Contracts',
      type: 'auction',
      draftType: 'auction',
      teamCount: 12,
      season: 2025,
      scoring: SCORING_PRESETS[0]!,
      roster: DEFAULT_ROSTER_12,
      draftSlot: 1,
      strategyId: 'balanced',
      auctionBudget: 200,
      contractRules: { ...DEFAULT_CONTRACT_RULES },
    });
    this.leagues.set(auction.id, auction);
    this.drafts.set(auction.id, this.createEmptyDraft(auction.id));
    const slots =
      auction.roster.qb +
      auction.roster.rb +
      auction.roster.wr +
      auction.roster.te +
      auction.roster.flex +
      auction.roster.superflex +
      auction.roster.bench;
    this.formats.ensureAuction(auction.id, auction.teamCount, 200, slots, 'roster-user');
    this.recalculateForLeague(auction.id);

    this.seedDemoOutcomes(demo.id);
    return { demo, dynasty, auction };
  }

  private seedDemoOutcomes(leagueId: string) {
    const board = this.getBoard(leagueId)
      .filter((b) => b.recommendation)
      .map((b) => b.recommendation!)
      .sort((a, b) => a.rank - b.rank);
    if (board.length < 4) return;
    const samples = [
      recordOutcome({
        leagueId,
        pickNumber: 3,
        actualPlayerId: board[0]!.playerId,
        recommendations: board,
      }),
      recordOutcome({
        leagueId,
        pickNumber: 28,
        actualPlayerId: board[3]!.playerId,
        recommendations: board,
      }),
      recordOutcome({
        leagueId,
        pickNumber: 51,
        actualPlayerId: board[1]!.playerId,
        recommendations: board,
      }),
      recordOutcome({
        leagueId,
        pickNumber: 76,
        actualPlayerId: board[5]?.playerId ?? board[2]!.playerId,
        recommendations: board,
      }),
    ];
    // Pad to a calibratable sample with synthetic reach-downs.
    for (let i = 0; i < 8; i++) {
      samples.push(
        recordOutcome({
          leagueId,
          pickNumber: 100 + i,
          actualPlayerId: board[Math.min(board.length - 1, 2 + (i % 4))]!.playerId,
          recommendations: board,
        }),
      );
    }
    this.formats.outcomes.set(leagueId, samples);
  }

  listPlayers() {
    return this.seeds.map((s) => s.player);
  }

  getPlayer(id: string) {
    return this.seeds.find((s) => s.player.id === id)?.player;
  }

  getEvaluation(id: string) {
    return this.evaluations.get(id);
  }

  getLeagueEvaluation(leagueId: string, playerId: string): PlayerEvaluation | undefined {
    return this.leagueEvaluations.get(leagueId)?.get(playerId) ?? this.evaluations.get(playerId);
  }

  listEvaluations() {
    return [...this.evaluations.values()];
  }

  listLeagues(userId?: string) {
    const all = [...this.leagues.values()];
    if (!userId) return all;
    return all.filter((l) => l.userId === userId);
  }

  getLeague(id: string) {
    return this.leagues.get(id);
  }

  getLeagueForUser(userId: string, leagueId: string): League | null {
    const league = this.leagues.get(leagueId);
    if (!league || league.userId !== userId) return null;
    return league;
  }

  assertOwns(userId: string, leagueId: string): League | null {
    return this.getLeagueForUser(userId, leagueId);
  }

  hydrateLeagues(leagues: League[]) {
    for (const league of leagues) {
      this.upsertLeague(league);
      if (!this.leagueEvaluations.has(league.id)) {
        this.recalculateForLeague(league.id);
      }
    }
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
    const next = { ...existing, ...patch, id, userId: existing.userId };
    this.leagues.set(id, next);
    return next;
  }

  getDraft(leagueId: string) {
    return this.drafts.get(leagueId);
  }

  patchDraft(leagueId: string, patch: Partial<DraftState>) {
    const draft = this.drafts.get(leagueId);
    if (!draft) return null;
    const next = { ...draft, ...patch };
    this.drafts.set(leagueId, next);
    return next;
  }

  scoringSummary(leagueId: string) {
    const league = this.leagues.get(leagueId);
    if (!league) return null;
    return summarizeScoring(league.scoring, league.roster);
  }

  /** Recompute evaluations against the league's team count (ADP overall pick depends on it). */
  recalculateForLeague(leagueId: string) {
    const league = this.leagues.get(leagueId);
    if (!league) return null;
    const cache = new Map<string, PlayerEvaluation>();
    const weights = this.formats.getActiveWeights(leagueId);
    for (const seed of this.seeds) {
      const evaluation = evaluatePlayer({
        player: seed.player,
        factors: seed.factors,
        value: {
          adpRoundPick: seed.market.adpRoundPick,
          fseRank: seed.market.fseRank,
          espnProjectionRank: seed.market.espnProjectionRank,
          projectedRank: seed.market.projectedRank,
          teamCount: league.teamCount,
        },
        risk: seed.risk,
        weights,
      });
      cache.set(seed.player.id, evaluation);
    }
    this.leagueEvaluations.set(leagueId, cache);
    return {
      leagueId,
      playerCount: this.seeds.length,
      scoring: scoringConfirmation(league),
    };
  }

  adherence(leagueId: string) {
    const league = this.leagues.get(leagueId);
    const draft = this.drafts.get(leagueId);
    if (!league || !draft) return null;
    const picks = picksFromEvents(
      draft.picks,
      draft.userRosterId,
      (id) => this.getPlayer(id)?.position ?? null,
    );
    return scoreAdherence(league.strategyId ?? 'balanced', picks);
  }

  recap(leagueId: string) {
    const league = this.leagues.get(leagueId);
    const draft = this.drafts.get(leagueId);
    if (!league || !draft) return null;
    return buildRecap({
      league,
      draft,
      getPlayer: (id) => this.getPlayer(id),
      getEvaluation: (id) => this.getLeagueEvaluation(leagueId, id),
    });
  }

  getBoard(leagueId: string): BoardPlayer[] {
    const league = this.leagues.get(leagueId);
    const draft = this.drafts.get(leagueId);
    if (!league || !draft) return [];
    if (!this.leagueEvaluations.has(leagueId)) this.recalculateForLeague(leagueId);

    const draftedIds = new Set(draft.picks.filter((p) => p.playerId).map((p) => p.playerId!));
    const userRoster = draft.picks
      .filter((p) => p.rosterId === draft.userRosterId && p.playerId)
      .map((p) => this.getPlayer(p.playerId!)!)
      .filter(Boolean);

    const available = this.seeds
      .filter((s) => !draftedIds.has(s.player.id))
      .map((s) => ({
        player: s.player,
        evaluation: this.getLeagueEvaluation(leagueId, s.player.id)!,
      }));

    const round = Math.floor((draft.currentPick - 1) / league.teamCount) + 1;
    const progress = projectUserPickProgress(
      league.draftSlot ?? 1,
      league.teamCount,
      draft.currentPick,
      draft.picksUntilUser,
    );
    const nextUserPick = progress?.nextOverall ?? draft.currentPick;
    const picksUntilNext = progress?.picksUntilNext ?? 0;
    const positionRunByPosition = this.detectPositionRuns(draft.picks, 10);

    const strategyId = (league.strategyId ?? 'balanced') as StrategyId;
    const targetSet = this.targets.get(leagueId) ?? new Set();
    const avoidSet = this.avoids.get(leagueId) ?? new Set();
    let recs = recommendPlayers({
      strategyId,
      round,
      picksUntilNext,
      nextUserPickOverall: nextUserPick,
      userRoster,
      rosterShape: league.roster,
      teamCount: league.teamCount,
      scoring: league.scoring,
      available,
      targets: targetSet,
      avoids: avoidSet,
      positionRunByPosition,
    });

    if (league.type === 'dynasty') {
      const mode = this.formats.dynastyMode.get(leagueId) ?? league.dynastyMode ?? 'neutral';
      const npvByPlayer = new Map<string, number>();
      for (const s of this.seeds) {
        const evaluation = this.getLeagueEvaluation(leagueId, s.player.id)!;
        npvByPlayer.set(s.player.id, buildMultiYearCurve(s.player, evaluation, league.season).npv);
      }
      recs = applyDynastyModeToRecommendations(recs, mode, npvByPlayer);
    }

    const recById = new Map(recs.map((r) => [r.playerId, r]));

    return this.seeds
      .map((s) => ({
        player: withHeadshot(s.player),
        evaluation: this.getLeagueEvaluation(leagueId, s.player.id)!,
        recommendation: recById.get(s.player.id),
        drafted: draftedIds.has(s.player.id),
        target: targetSet.has(s.player.id),
        avoid: avoidSet.has(s.player.id),
        projectedPoints: s.market.projectedPoints ?? null,
      }))
      .sort((a, b) => {
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

    // Capture recommendations before mutating draft state (calibration).
    const prePickRecs =
      event.playerId && event.rosterId === draft.userRosterId
        ? this.getBoard(leagueId)
            .filter((b) => b.recommendation && !b.drafted)
            .map((b) => b.recommendation!)
            .sort((a, b) => a.rank - b.rank)
        : null;

    const existingIdx = draft.picks.findIndex((p) => p.pickNumber === event.pickNumber);
    if (existingIdx >= 0) draft.picks[existingIdx] = event;
    else draft.picks.push(event);

    draft.picks.sort((a, b) => a.pickNumber - b.pickNumber);
    draft.currentPick = Math.max(draft.currentPick, event.pickNumber + 1);
    draft.availablePlayerIds = draft.availablePlayerIds.filter((id) => id !== event.playerId);
    draft.lastSyncedAt = new Date().toISOString();
    draft.status = 'drafting';
    const league = this.leagues.get(leagueId);
    if (league) {
      const progress = projectUserPickProgress(
        league.draftSlot ?? 1,
        league.teamCount,
        draft.currentPick,
      );
      draft.picksUntilUser = progress?.picksUntilNext ?? null;
    }

    if (prePickRecs && event.playerId) {
      const outcome = recordOutcome({
        leagueId,
        pickNumber: event.pickNumber,
        actualPlayerId: event.playerId,
        recommendations: prePickRecs,
      });
      const list = this.formats.outcomes.get(leagueId) ?? [];
      const idx = list.findIndex((o) => o.pickNumber === outcome.pickNumber);
      if (idx >= 0) list[idx] = outcome;
      else list.push(outcome);
      this.formats.outcomes.set(leagueId, list);
    }

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

  getFlags(leagueId: string) {
    return {
      targets: [...(this.targets.get(leagueId) ?? [])],
      avoids: [...(this.avoids.get(leagueId) ?? [])],
    };
  }

  private simPool(leagueId: string, teamCount: number): SimPlayer[] {
    const pool: SimPlayer[] = [];
    for (const s of this.seeds) {
      const evaluation = this.getLeagueEvaluation(leagueId, s.player.id);
      if (!evaluation) continue;
      const adpOverall = adpToOverallPick(s.market.adpRoundPick, teamCount);
      if (!Number.isFinite(adpOverall)) continue;
      pool.push({
        id: s.player.id,
        name: s.player.name,
        position: s.player.position,
        adpOverall,
        draftScore: evaluation.draftScore,
      });
    }
    return pool;
  }

  simulate(
    leagueId: string,
    opts: {
      strategyId?: StrategyId;
      iterations?: number;
      rounds?: number;
      seed?: number;
      draftSlot?: number;
      adpVarianceRatio?: number;
      adpVarianceFloor?: number;
    },
  ) {
    const league = this.leagues.get(leagueId);
    if (!league) return null;
    const strategyId = (opts.strategyId ?? league.strategyId ?? 'balanced') as StrategyId;
    const iterations = clampIterations(opts.iterations ?? 500);
    const pool = this.simPool(leagueId, league.teamCount);
    if (pool.length === 0) {
      throw new Error('Simulation pool is empty — player evaluations are not ready');
    }
    return simulateStrategy({
      strategyId,
      slot: opts.draftSlot ?? league.draftSlot ?? 1,
      teamCount: league.teamCount,
      rounds: opts.rounds ?? 8,
      iterations,
      seed: opts.seed ?? 42,
      adpVarianceRatio: opts.adpVarianceRatio,
      adpVarianceFloor: opts.adpVarianceFloor,
      includeDetails: true,
      players: pool,
    });
  }

  compare(
    leagueId: string,
    opts: {
      strategyIds?: StrategyId[];
      iterations?: number;
      rounds?: number;
      seed?: number;
      draftSlot?: number;
      adpVarianceRatio?: number;
      adpVarianceFloor?: number;
    },
  ) {
    const league = this.leagues.get(leagueId);
    if (!league) return null;
    const strategyIds = (opts.strategyIds ??
      ([
        'balanced',
        'hero_wr',
        'double_hero_rb',
        'elite_te',
        'hero_rb',
        'robust_rb',
        'double_hero_wr',
        'zero_rb',
        'elite_qb',
      ] as StrategyId[])) as StrategyId[];
    const slot = opts.draftSlot ?? league.draftSlot ?? 1;
    const rounds = opts.rounds ?? 8;
    // Compare is multi-strategy; keep iterations modest for Worker CPU limits.
    const iterations = Math.min(clampIterations(opts.iterations ?? 40), 40);
    const seed = opts.seed ?? 42;
    const adpVarianceRatio = opts.adpVarianceRatio ?? 0.12;
    const adpVarianceFloor = opts.adpVarianceFloor ?? 1.5;
    const cacheKey = [
      leagueId,
      slot,
      rounds,
      iterations,
      seed,
      adpVarianceRatio,
      adpVarianceFloor,
      strategyIds.join(','),
    ].join('|');
    const cached = this.compareCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 5 * 60_000) {
      return cached.value;
    }

    const pool = this.simPool(leagueId, league.teamCount);
    if (pool.length === 0) {
      throw new Error('Simulation pool is empty — player evaluations are not ready');
    }
    const value = compareStrategies({
      strategyIds,
      slot,
      teamCount: league.teamCount,
      rounds,
      iterations,
      seed,
      adpVarianceRatio,
      adpVarianceFloor,
      players: pool,
    });
    this.compareCache.set(cacheKey, { at: Date.now(), value });
    // Bound cache size for long-lived isolates.
    if (this.compareCache.size > 40) {
      const oldest = [...this.compareCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.compareCache.delete(oldest[0]);
    }
    return value;
  }

  /**
   * Positional cheat sheet grouped by absolute quality band.
   *
   * Contract note: `tier` may be `null` for no-data players (zero known ceiling
   * factors). The legacy `unranked` side-list was removed — those rows appear
   * inline with `tier: null`.
   */
  cheatSheet(leagueId: string) {
    const league = this.leagues.get(leagueId);
    if (!league) return null;
    const targetSet = this.targets.get(leagueId) ?? new Set();
    const avoidSet = this.avoids.get(leagueId) ?? new Set();
    const players = this.seeds.map((s) => {
      const evaluation = this.getLeagueEvaluation(leagueId, s.player.id)!;
      return {
        id: s.player.id,
        name: s.player.name,
        position: s.player.position,
        draftScore: evaluation.draftScore,
        ceilingScore: evaluation.ceiling.ceilingScore,
        provisional: evaluation.ceiling.provisional,
        ceilingKnownFactors: evaluation.ceiling.knownFactors,
        adpRoundPick: evaluation.value.adpRoundPick,
        target: targetSet.has(s.player.id),
        avoid: avoidSet.has(s.player.id),
      };
    });
    return buildCheatSheet(players);
  }

  // --- Dynasty ---

  setDynastyMode(leagueId: string, mode: DynastyMode) {
    const league = this.leagues.get(leagueId);
    if (!league) return null;
    this.formats.dynastyMode.set(leagueId, mode);
    return this.updateLeague(leagueId, { dynastyMode: mode, type: 'dynasty' });
  }

  dynastyOverview(leagueId: string) {
    const league = this.leagues.get(leagueId);
    const draft = this.drafts.get(leagueId);
    if (!league || !draft) return null;

    const mode = this.formats.dynastyMode.get(leagueId) ?? league.dynastyMode ?? 'neutral';
    const userRoster = draft.picks
      .filter((p) => p.rosterId === draft.userRosterId && p.playerId)
      .map((p) => this.getPlayer(p.playerId!)!)
      .filter(Boolean);

    // If no picks yet, seed a plausible starter set from top dynasty scores for the age curve demo.
    const rosterPlayers =
      userRoster.length > 0 ? userRoster : this.seeds.slice(0, 10).map((s) => s.player);

    const toRow = (playerId: string) => {
      const player = this.getPlayer(playerId)!;
      const evaluation = this.getLeagueEvaluation(leagueId, playerId)!;
      const curve = buildMultiYearCurve(player, evaluation, league.season);
      const first = curve.points[0]?.value ?? 0;
      const last = curve.points[curve.points.length - 1]?.value ?? 0;
      const ratio = first > 0 ? last / first : 1;
      const trend: 'rising' | 'hold' | 'watch' | 'sell' =
        ratio >= 1.08 ? 'rising' : ratio >= 0.92 ? 'hold' : ratio >= 0.7 ? 'watch' : 'sell';
      return {
        playerId: player.id,
        name: player.name,
        position: player.position,
        age: player.age,
        seasonsInLeague: player.seasonsInLeague,
        archetype: evaluation.archetype.archetype,
        draftScore: evaluation.draftScore,
        npv: curve.npv,
        dynastyScore: dynastyCompositeScore(evaluation.draftScore, curve.npv, mode),
        trend,
        peakYearOffset: curve.peakYearOffset,
        contendWindow: curve.contendWindow,
        curve: {
          points: curve.points.map((p) => ({
            yearOffset: p.yearOffset,
            season: p.season,
            value: p.value,
          })),
          npv: curve.npv,
        },
      };
    };

    const rosterBoard = rosterPlayers
      .map((p) => toRow(p.id))
      .sort((a, b) => b.dynastyScore - a.dynastyScore);

    const board = this.seeds
      .map((s) => toRow(s.player.id))
      .sort((a, b) => b.dynastyScore - a.dynastyScore)
      .slice(0, 40);

    if (!this.formats.pickAssets.has(leagueId)) {
      this.formats.pickAssets.set(
        leagueId,
        seedPickAssets(league.teamCount, league.season, draft.userRosterId),
      );
    }
    const pickAssets = this.formats.pickAssets.get(leagueId)!;
    const ownedPicks = pickAssets.filter((p) => p.ownerRosterId === draft.userRosterId);
    const firsts = ownedPicks.filter((p) => p.round === 1).length;
    const seconds = ownedPicks.filter((p) => p.round === 2).length;

    // Roster contending window: intersection-ish of player windows weighted to mean.
    const windows = rosterBoard
      .map((r) => r.contendWindow)
      .filter((w): w is { start: number; end: number } => Boolean(w));
    const windowStart = windows.length
      ? Math.round(windows.reduce((s, w) => s + w.start, 0) / windows.length)
      : 0;
    const windowEnd = windows.length
      ? Math.round(windows.reduce((s, w) => s + w.end, 0) / windows.length)
      : Math.min(3, 3);
    const agingRisk = rosterPlayers.filter((p) => p.age >= 30).length;
    const ageCurve = buildRosterAgeCurve(rosterPlayers);

    return {
      leagueId,
      mode,
      ageCurve,
      pickAssets,
      ownedPickValue: ownedPickValue(pickAssets, draft.userRosterId),
      board,
      rosterBoard,
      rookieBoard: buildRookieBoard(
        this.seeds.map((s) => ({
          player: s.player,
          evaluation: this.getLeagueEvaluation(leagueId, s.player.id)!,
        })),
        league.season,
        mode === 'contend' ? 'contend' : 'rebuild',
      ),
      summary: {
        rosterCount: rosterPlayers.length,
        meanAge: ageCurve.meanAge,
        agingRisk,
        contendWindow: {
          startSeason: league.season + windowStart,
          endSeason: league.season + windowEnd,
          seasons: Math.max(1, windowEnd - windowStart + 1),
        },
        horizon: {
          startSeason: league.season + 1,
          endSeason: league.season + 4,
        },
        pickCount: ownedPicks.length,
        firsts,
        seconds,
      },
    };
  }

  // --- Auction ---

  private auctionPool(leagueId: string) {
    const league = this.leagues.get(leagueId);
    if (!league) return null;
    const draft = this.drafts.get(leagueId)!;
    const budget = league.auctionBudget ?? 200;
    const slots =
      league.roster.qb +
      league.roster.rb +
      league.roster.wr +
      league.roster.te +
      league.roster.flex +
      league.roster.superflex +
      league.roster.bench;
    this.formats.ensureAuction(leagueId, league.teamCount, budget, slots, draft.userRosterId);

    const bids = this.formats.auctionBids.get(leagueId) ?? [];
    const purchased = new Set(bids.map((b) => b.playerId));
    const board = selectAuctionBoard(this.auctionBoards, {
      scoring: league.scoring,
      roster: league.roster,
    });
    const sleeperIdToPlayerId = new Map<string, string>();
    for (const seed of this.seeds) {
      const sleeperId = seed.player.externalIds.sleeper;
      if (sleeperId) sleeperIdToPlayerId.set(String(sleeperId), seed.player.id);
    }
    const baseValues = board
      ? dollarValuesFromAuctionBoard(board, {
          sleeperIdToPlayerId,
          teamCount: league.teamCount,
          budgetPerTeam: budget,
          rosterSlots: slots,
        })
      : computeDollarValues(
          this.seeds.map((s) => ({
            playerId: s.player.id,
            position: s.player.position,
            draftScore: this.getLeagueEvaluation(leagueId, s.player.id)!.draftScore,
            vorp: vorpFromEvaluation(this.getLeagueEvaluation(leagueId, s.player.id)!),
          })),
          {
            teamCount: league.teamCount,
            budgetPerTeam: budget,
            rosterSlots: slots,
          },
        );
    const inflationRate = computeInflationRate(bids, baseValues);
    const values = applyInflation(baseValues, inflationRate, purchased);
    const rankByPlayerId = new Map<string, number>();
    if (board) {
      for (const row of board.players) {
        if (row.sleeper_id == null || row.overall_rank == null) continue;
        const playerId = sleeperIdToPlayerId.get(String(row.sleeper_id));
        if (playerId) rankByPlayerId.set(playerId, row.overall_rank);
      }
    }
    return {
      league,
      draft,
      budget,
      slots,
      bids,
      purchased,
      values,
      inflationRate,
      valueBoard: board ? { id: board.id, label: board.label } : null,
      rankByPlayerId,
    };
  }

  auctionState(leagueId: string) {
    const pool = this.auctionPool(leagueId);
    if (!pool) return null;
    const budgets = this.formats.auctionBudgets.get(leagueId)!;
    const rules =
      this.formats.contractRules.get(leagueId) ??
      pool.league.contractRules ??
      DEFAULT_CONTRACT_RULES;
    const user = budgets.find((b) => b.rosterId === pool.draft.userRosterId)!;
    const availableIds = new Set(
      pool.values.filter((v) => !pool.purchased.has(v.playerId)).map((v) => v.playerId),
    );
    const nominations = suggestNominations({
      values: pool.values,
      availableIds,
      targets: this.targets.get(leagueId) ?? new Set(),
      avoids: this.avoids.get(leagueId) ?? new Set(),
      rivalRemaining: budgets.filter((b) => b.rosterId !== user.rosterId).map((b) => b.remaining),
      userRemaining: user.remaining,
    });

    // Same player universe as getBoard(): every seed not yet purchased.
    // Dollar curve may omit edge cases; fall back to $1 stubs so the auction
    // room never shows a truncated board vs the player board page.
    const valueById = new Map(pool.values.map((v) => [v.playerId, v]));
    const vorById = computeVor(
      this.seeds.map((s) => ({
        id: s.player.id,
        position: s.player.position,
        projectedPoints: s.market.projectedPoints,
      })),
      pool.league.roster,
      pool.league.teamCount,
      resolveVorScoringFormat({
        reception: pool.league.scoring.reception,
        variant: pool.league.scoring.variant,
      }),
    );
    const valueRows = this.seeds
      .filter((s) => !pool.purchased.has(s.player.id))
      .map((s) => {
        const evaluation = this.getLeagueEvaluation(leagueId, s.player.id)!;
        const priced = valueById.get(s.player.id);
        return {
          playerId: s.player.id,
          fairValue: priced?.fairValue ?? 1,
          inflatedValue: priced?.inflatedValue ?? 1,
          ceilingValue: priced?.ceilingValue ?? null,
          vorpShare: priced?.vorpShare ?? 0,
          name: s.player.name,
          position: s.player.position,
          age: s.player.age,
          draftScore: evaluation.draftScore,
          archetype: evaluation.archetype.archetype,
          overallRank: pool.rankByPlayerId.get(s.player.id) ?? null,
          vor: vorById.get(s.player.id) ?? null,
          projectedPoints: s.market.projectedPoints ?? null,
        };
      })
      .sort((a, b) => b.fairValue - a.fairValue || b.draftScore - a.draftScore);

    const toSigned = (b: (typeof pool.bids)[number]): {
      playerId: string;
      name: string;
      position: 'QB' | 'RB' | 'WR' | 'TE';
      amount: number;
      contractYears: number;
      team: string;
    } => {
      const player = this.getPlayer(b.playerId);
      return {
        playerId: b.playerId,
        name: player?.name ?? b.playerId,
        position: player?.position ?? 'WR',
        amount: b.amount,
        contractYears: b.contractYears ?? 1,
        team: player?.team ?? '',
      };
    };

    const signedRoster = pool.bids.filter((b) => b.rosterId === user.rosterId).map(toSigned);

    const teamRosters = budgets.map((budget) => ({
      rosterId: budget.rosterId,
      name: budget.name,
      players: pool.bids.filter((b) => b.rosterId === budget.rosterId).map(toSigned),
    }));

    return {
      leagueId,
      inflationRate: pool.inflationRate,
      budgets,
      bids: pool.bids,
      contractRules: rules,
      values: valueRows,
      nominations: nominations.map((n) => ({
        ...n,
        name: this.getPlayer(n.playerId)?.name ?? n.playerId,
      })),
      userBudget: user,
      signedRoster,
      teamRosters,
      lotNumber: pool.bids.length + 1,
      lotTotal: budgets.reduce((n, b) => n + b.rosterSlotsTotal, 0),
      cap: user.startingBudget,
      valueBoard: pool.valueBoard,
    };
  }

  placeAuctionBid(
    leagueId: string,
    body: { playerId: string; amount: number; rosterId?: string; contractYears?: number },
  ) {
    const pool = this.auctionPool(leagueId);
    if (!pool) return null;
    if (pool.purchased.has(body.playerId)) return { error: 'Player already purchased' as const };

    const rosterId = body.rosterId ?? pool.draft.userRosterId;
    const budgets = this.formats.auctionBudgets.get(leagueId)!;
    const team = budgets.find((b) => b.rosterId === rosterId);
    if (!team) return { error: 'Unknown roster' as const };
    if (body.amount > team.remaining) return { error: 'Bid exceeds remaining budget' as const };
    if (body.amount < 1) return { error: 'Bid must be at least $1' as const };

    const bid = {
      playerId: body.playerId,
      rosterId,
      amount: body.amount,
      contractYears: body.contractYears,
      nominatedAt: new Date().toISOString(),
    };
    const bids = [...pool.bids, bid];
    this.formats.auctionBids.set(leagueId, bids);
    this.formats.auctionBudgets.set(leagueId, applyBidToBudgets(budgets, bid));

    // Mirror into draft picks for shared board/recap tooling.
    const pickNumber = bids.length;
    this.applyPick(leagueId, {
      pickNumber,
      round: 1,
      slot: 1,
      playerId: body.playerId,
      rosterId,
      source: 'manual',
    });

    return this.auctionState(leagueId);
  }

  renameAuctionTeam(leagueId: string, rosterId: string, name: string) {
    const pool = this.auctionPool(leagueId);
    if (!pool) return null;

    const trimmed = name.trim();
    if (!trimmed) return { error: 'Team name is required' as const };
    if (trimmed.length > 40) return { error: 'Team name must be 40 characters or fewer' as const };

    const budgets = this.formats.auctionBudgets.get(leagueId);
    if (!budgets) return null;
    const team = budgets.find((b) => b.rosterId === rosterId);
    if (!team) return { error: 'Unknown roster' as const };

    this.formats.auctionBudgets.set(
      leagueId,
      budgets.map((b) => (b.rosterId === rosterId ? { ...b, name: trimmed } : b)),
    );
    return this.auctionState(leagueId);
  }

  auctionMaxBid(leagueId: string, playerId: string) {
    const pool = this.auctionPool(leagueId);
    if (!pool) return null;
    const budgets = this.formats.auctionBudgets.get(leagueId)!;
    const user = budgets.find((b) => b.rosterId === pool.draft.userRosterId)!;
    const slotsLeft = Math.max(1, user.rosterSlotsTotal - user.rosterSlotsFilled);
    const priced = pool.values.find((v) => v.playerId === playerId);
    if (priced?.ceilingValue != null) {
      return {
        playerId,
        maxBid: priced.ceilingValue,
        remainingBudget: user.remaining,
        slotsLeft,
        reserveForRest: 0,
      };
    }
    return computeMaxBid({
      playerId,
      remainingBudget: user.remaining,
      slotsLeft,
    });
  }

  auctionContractPreview(
    leagueId: string,
    body: { playerId: string; annualSalary: number; years: number },
  ) {
    const league = this.leagues.get(leagueId);
    const player = this.getPlayer(body.playerId);
    const evaluation = this.getEvaluation(body.playerId);
    if (!league || !player || !evaluation) return null;
    const rules =
      this.formats.contractRules.get(leagueId) ?? league.contractRules ?? DEFAULT_CONTRACT_RULES;
    const curve = buildMultiYearCurve(player, evaluation, league.season);
    return valueContract({
      playerId: body.playerId,
      annualSalary: body.annualSalary,
      years: body.years,
      curve,
      rules,
    });
  }

  setContractRules(leagueId: string, rules: Partial<ContractRules>) {
    const league = this.leagues.get(leagueId);
    if (!league) return null;
    const next = {
      ...(this.formats.contractRules.get(leagueId) ?? DEFAULT_CONTRACT_RULES),
      ...rules,
    };
    this.formats.contractRules.set(leagueId, next);
    this.updateLeague(leagueId, { contractRules: next, type: 'auction', draftType: 'auction' });
    return next;
  }

  // --- Calibration ---

  calibrationSummary(leagueId: string) {
    if (!this.leagues.get(leagueId)) return null;
    const outcomes = this.formats.outcomes.get(leagueId) ?? [];
    const rows = buildRecVsActual(outcomes, (id) => this.getPlayer(id)?.name ?? null);
    const bands = this.formats.getActiveBands(leagueId);
    const weights = this.formats.getActiveWeights(leagueId);
    const proposal =
      this.formats.calibration.get(leagueId) ??
      (outcomes.length ? proposeCalibration(outcomes, bands, weights) : null);
    return {
      leagueId,
      outcomes,
      rows,
      proposal,
      activeBands: bands,
      activeWeights: weights,
    };
  }

  proposeLeagueCalibration(leagueId: string) {
    if (!this.leagues.get(leagueId)) return null;
    const outcomes = this.formats.outcomes.get(leagueId) ?? [];
    const proposal = proposeCalibration(
      outcomes,
      this.formats.getActiveBands(leagueId),
      this.formats.getActiveWeights(leagueId),
    );
    this.formats.calibration.set(leagueId, proposal);
    return proposal;
  }

  applyLeagueCalibration(leagueId: string) {
    const proposal =
      this.formats.calibration.get(leagueId) ?? this.proposeLeagueCalibration(leagueId);
    if (!proposal) return null;
    this.formats.applyCalibration(leagueId, proposal);
    const applied = { ...proposal, applied: true };
    this.formats.calibration.set(leagueId, applied);
    this.recalculateForLeague(leagueId);
    return applied;
  }

  resetDraft(leagueId: string) {
    if (!this.leagues.has(leagueId)) return null;
    const fresh = this.createEmptyDraft(leagueId);
    this.drafts.set(leagueId, fresh);
    this.formats.outcomes.delete(leagueId);
    this.formats.calibration.delete(leagueId);
    return fresh;
  }

  removeLeague(leagueId: string) {
    if (!this.leagues.has(leagueId)) return false;
    this.leagues.delete(leagueId);
    this.drafts.delete(leagueId);
    this.targets.delete(leagueId);
    this.avoids.delete(leagueId);
    this.leagueEvaluations.delete(leagueId);
    this.formats.clearLeague(leagueId);
    for (const key of [...this.compareCache.keys()]) {
      if (key.startsWith(`${leagueId}:`)) this.compareCache.delete(key);
    }
    return true;
  }

  private createEmptyDraft(leagueId: string): DraftState {
    return {
      leagueId,
      draftId: `draft-${leagueId}`,
      status: 'pre_draft',
      currentPick: 1,
      picks: [],
      availablePlayerIds: this.seeds.map((s) => s.player.id),
      userRosterId: 'roster-user',
      lastSyncedAt: null,
      syncMode: 'manual',
      syncBanner: null,
      lastPickedUpstream: null,
      picksUntilUser: null,
    };
  }

  /** Share of recent picks at each position — used to amplify survival urgency during runs. */
  private detectPositionRuns(
    picks: PickEvent[],
    window: number,
  ): Partial<Record<Position, number>> {
    const recent = picks
      .filter((p) => p.playerId)
      .sort((a, b) => b.pickNumber - a.pickNumber)
      .slice(0, window);
    if (recent.length < 4) return {};
    const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of recent) {
      const pos = this.getPlayer(p.playerId!)?.position;
      if (pos) counts[pos] += 1;
    }
    const out: Partial<Record<Position, number>> = {};
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as Position[]) {
      const share = counts[pos] / recent.length;
      // Flag a run when a position is clearly over-represented vs equal mix (~25%).
      if (share >= 0.45) out[pos] = Math.min(1, (share - 0.25) / 0.5);
    }
    return out;
  }
}

/** Keep Monte Carlo runs inside Worker CPU budgets while still supporting Figma-scale controls. */
function clampIterations(n: number): number {
  if (!Number.isFinite(n)) return 200;
  return Math.max(20, Math.min(800, Math.floor(n)));
}

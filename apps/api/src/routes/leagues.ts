import type { FastifyInstance } from 'fastify';
import type { DraftType, LeagueType, RosterShape, StrategyId } from '@draftlab/domain';
import {
  createManualLeague,
  DEFAULT_ROSTER_12,
  mapSleeperLeague,
  resolveDraftSlot,
  rosterPresetForScoring,
  scoringConfirmation,
  SCORING_PRESETS,
  SleeperClient,
  sharedSleeperLimiter,
} from '@draftlab/integrations';
import type { AppStore } from '../services/store.js';
import type { DraftPoller } from '../services/draft-poller.js';

export async function leagueRoutes(app: FastifyInstance, store: AppStore, poller: DraftPoller) {
  app.get('/api/leagues', async () => store.listLeagues());

  app.get('/api/sleeper/limiter', async () => sharedSleeperLimiter.snapshot());

  app.get<{ Params: { id: string } }>('/api/leagues/:id', async (req, reply) => {
    const league = store.getLeague(req.params.id);
    if (!league) return reply.code(404).send({ error: 'League not found' });
    return {
      ...league,
      scoringSummary: scoringConfirmation(league),
    };
  });

  app.get('/api/scoring-presets', async () => SCORING_PRESETS);

  app.post<{
    Body: {
      name: string;
      teamCount: number;
      season?: number;
      draftSlot?: number;
      strategyId?: StrategyId;
      scoringPresetId?: string;
      draftType?: DraftType;
      type?: LeagueType;
      roster?: Partial<RosterShape>;
      confirmSummary?: boolean;
    };
  }>('/api/leagues/manual', async (req, reply) => {
    const scoring =
      SCORING_PRESETS.find((p) => p.id === req.body.scoringPresetId) ?? SCORING_PRESETS[0]!;
    const baseRoster = rosterPresetForScoring(req.body.scoringPresetId);
    const roster: RosterShape = {
      ...baseRoster,
      ...req.body.roster,
      totalStarters: 0,
    };
    roster.totalStarters = roster.qb + roster.rb + roster.wr + roster.te + roster.flex + roster.superflex;

    const league = createManualLeague({
      name: req.body.name,
      teamCount: req.body.teamCount,
      season: req.body.season ?? 2025,
      scoring,
      roster,
      draftSlot: req.body.draftSlot,
      strategyId: req.body.strategyId ?? 'balanced',
      draftType: req.body.draftType,
      type: req.body.type,
    });
    const saved = store.upsertLeague(league);
    store.recalculateForLeague(saved.id);
    const summary = scoringConfirmation(saved);
    if (!req.body.confirmSummary) {
      return reply.code(201).send({
        league: saved,
        scoringSummary: summary,
        requiresConfirmation: true,
        message: 'Confirm scoring summary before drafting.',
      });
    }
    return { league: saved, scoringSummary: summary, requiresConfirmation: false };
  });

  app.post<{ Body: { username: string; season?: number } }>('/api/leagues/sleeper/connect', async (req, reply) => {
    const client = new SleeperClient();
    try {
      const user = await client.getUser(req.body.username);
      const season = req.body.season ?? new Date().getFullYear();
      const leagues = await client.getUserLeagues(user.user_id, season);
      const mapped = [];
      for (const l of leagues) {
        let draft = null;
        try {
          const drafts = await client.getLeagueDrafts(l.league_id);
          draft = drafts[0] ?? null;
        } catch {
          draft = null;
        }
        const league = mapSleeperLeague(l, { draft });
        league.sleeperUserId = user.user_id;
        if (draft && user.user_id) {
          league.draftSlot = resolveDraftSlot(draft, user.user_id) ?? league.draftSlot;
        }
        const saved = store.upsertLeague(league);
        store.recalculateForLeague(saved.id);
        mapped.push({
          ...saved,
          scoringSummary: scoringConfirmation(saved),
        });
        if (saved.sleeperDraftId) poller.start(saved.id);
      }
      return { user, leagues: mapped, limiter: client.limiterSnapshot() };
    } catch (err) {
      return reply.code(502).send({
        error: 'Failed to reach Sleeper',
        detail: err instanceof Error ? err.message : String(err),
        limiter: sharedSleeperLimiter.snapshot(),
      });
    }
  });

  app.post<{ Params: { id: string } }>('/api/leagues/:id/recalculate', async (req, reply) => {
    const result = store.recalculateForLeague(req.params.id);
    if (!result) return reply.code(404).send({ error: 'League not found' });
    return result;
  });

  app.get<{ Params: { id: string } }>('/api/leagues/:id/scoring-summary', async (req, reply) => {
    const summary = store.scoringSummary(req.params.id);
    if (!summary) return reply.code(404).send({ error: 'League not found' });
    return summary;
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      strategyId: StrategyId;
      draftSlot: number;
      sleeperDraftId: string;
      name: string;
    }>;
  }>('/api/leagues/:id', async (req, reply) => {
    const league = store.updateLeague(req.params.id, req.body);
    if (!league) return reply.code(404).send({ error: 'League not found' });
    if (req.body.sleeperDraftId) poller.start(league.id);
    return { ...league, scoringSummary: scoringConfirmation(league) };
  });

  app.get<{ Params: { id: string } }>('/api/leagues/:id/board', async (req, reply) => {
    if (!store.getLeague(req.params.id)) return reply.code(404).send({ error: 'League not found' });
    return store.getBoard(req.params.id);
  });

  app.get<{ Params: { id: string } }>('/api/leagues/:id/draft', async (req, reply) => {
    const draft = store.getDraft(req.params.id);
    if (!draft) return reply.code(404).send({ error: 'Draft not found' });
    return draft;
  });

  app.get<{ Params: { id: string } }>('/api/leagues/:id/adherence', async (req, reply) => {
    const result = store.adherence(req.params.id);
    if (!result) return reply.code(404).send({ error: 'League not found' });
    return result;
  });

  app.get<{ Params: { id: string } }>('/api/leagues/:id/recap', async (req, reply) => {
    const result = store.recap(req.params.id);
    if (!result) return reply.code(404).send({ error: 'League not found' });
    return result;
  });

  app.post<{ Params: { id: string } }>('/api/leagues/:id/draft/start-polling', async (req, reply) => {
    const league = store.getLeague(req.params.id);
    if (!league?.sleeperDraftId) {
      return reply.code(400).send({ error: 'League has no Sleeper draft id — use manual picks' });
    }
    store.patchDraft(req.params.id, { syncMode: 'polling', syncBanner: null });
    poller.start(league.id);
    return store.getDraft(req.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/leagues/:id/draft/manual-mode', async (req, reply) => {
    const draft = store.patchDraft(req.params.id, {
      syncMode: 'manual',
      syncBanner: 'Manual pick entry — Sleeper polling paused.',
    });
    if (!draft) return reply.code(404).send({ error: 'Draft not found' });
    poller.stop(req.params.id);
    return draft;
  });

  app.post<{
    Params: { id: string };
    Body: {
      pickNumber: number;
      round: number;
      slot: number;
      playerId: string;
      rosterId?: string;
    };
  }>('/api/leagues/:id/draft/picks', async (req, reply) => {
    const draft = store.getDraft(req.params.id);
    if (!draft) return reply.code(404).send({ error: 'Draft not found' });
    const updated = store.applyPick(req.params.id, {
      pickNumber: req.body.pickNumber,
      round: req.body.round,
      slot: req.body.slot,
      playerId: req.body.playerId,
      rosterId: req.body.rosterId ?? draft.userRosterId,
      source: 'manual',
    });
    return {
      draft: updated,
      board: store.getBoard(req.params.id),
      adherence: store.adherence(req.params.id),
    };
  });

  app.post<{ Params: { id: string }; Body: { playerId: string; kind: 'target' | 'avoid'; value?: boolean } }>(
    '/api/leagues/:id/flags',
    async (req, reply) => {
      if (!store.getLeague(req.params.id)) return reply.code(404).send({ error: 'League not found' });
      store.setFlag(req.params.id, req.body.playerId, req.body.kind, req.body.value ?? true);
      return { ok: true, ...store.getFlags(req.params.id) };
    },
  );

  app.get<{ Params: { id: string } }>('/api/leagues/:id/flags', async (req, reply) => {
    if (!store.getLeague(req.params.id)) return reply.code(404).send({ error: 'League not found' });
    return store.getFlags(req.params.id);
  });
}

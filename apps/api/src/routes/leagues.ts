import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { DraftType, LeagueType, RosterShape, StrategyId } from '@draftlab/domain';
import {
  createManualLeague,
  mapSleeperLeague,
  resolveDraftSlot,
  rosterPresetForScoring,
  scoringConfirmation,
  SCORING_PRESETS,
  SleeperClient,
  sharedSleeperLimiter,
} from '@draftlab/integrations';
import { authenticate, requireUser } from '../auth/plugin.js';
import { getLeagueForUser, listLeaguesForUser, updateLeagueRow, upsertLeagueRow } from '../db/leagues.js';
import type { AppStore } from '../services/store.js';
import type { DraftPoller } from '../services/draft-poller.js';

async function ownedLeague(
  store: AppStore,
  pool: Pool,
  userId: string,
  leagueId: string,
) {
  const memory = store.assertOwns(userId, leagueId);
  if (memory) return memory;
  const fromDb = await getLeagueForUser(pool, userId, leagueId);
  if (!fromDb) return null;
  store.hydrateLeagues([fromDb]);
  return fromDb;
}

export async function leagueRoutes(
  app: FastifyInstance,
  store: AppStore,
  poller: DraftPoller,
  pool: Pool,
) {
  app.get('/api/scoring-presets', async () => SCORING_PRESETS);

  app.get('/api/sleeper/limiter', async () => sharedSleeperLimiter.snapshot());

  app.get('/api/leagues', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const user = requireUser(req);
    const fromDb = await listLeaguesForUser(pool, user.sub);
    store.hydrateLeagues(fromDb);
    return store.listLeagues(user.sub).map((league) => ({
      ...league,
      scoringSummary: scoringConfirmation(league),
    }));
  });

  app.get<{ Params: { id: string } }>(
    '/api/leagues/:id',
    { preHandler: authenticate },
    async (req, reply) => {
      if (reply.sent) return;
      const user = requireUser(req);
      const league = await ownedLeague(store, pool, user.sub, req.params.id);
      if (!league) return reply.code(404).send({ error: 'League not found' });
      return {
        ...league,
        scoringSummary: scoringConfirmation(league),
      };
    },
  );

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
  }>('/api/leagues/manual', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const user = requireUser(req);
    const scoring =
      SCORING_PRESETS.find((p) => p.id === req.body.scoringPresetId) ?? SCORING_PRESETS[0]!;
    const baseRoster = rosterPresetForScoring(req.body.scoringPresetId);
    const roster: RosterShape = {
      ...baseRoster,
      ...req.body.roster,
      totalStarters: 0,
    };
    roster.totalStarters =
      roster.qb + roster.rb + roster.wr + roster.te + roster.flex + roster.superflex;

    const league = createManualLeague({
      userId: user.sub,
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
    const persisted = await upsertLeagueRow(pool, league);
    const saved = store.upsertLeague(persisted);
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

  app.post<{ Body: { username: string; season?: number } }>(
    '/api/leagues/sleeper/connect',
    { preHandler: authenticate },
    async (req, reply) => {
      if (reply.sent) return;
      const user = requireUser(req);
      const client = new SleeperClient();
      try {
        const sleeperUser = await client.getUser(req.body.username);
        const season = req.body.season ?? new Date().getFullYear();
        const leagues = await client.getUserLeagues(sleeperUser.user_id, season);
        const mapped = [];
        for (const l of leagues) {
          let draft = null;
          try {
            const drafts = await client.getLeagueDrafts(l.league_id);
            draft = drafts[0] ?? null;
          } catch {
            draft = null;
          }
          const league = mapSleeperLeague(l, { userId: user.sub, draft });
          league.sleeperUserId = sleeperUser.user_id;
          if (draft && sleeperUser.user_id) {
            league.draftSlot = resolveDraftSlot(draft, sleeperUser.user_id) ?? league.draftSlot;
          }
          const persisted = await upsertLeagueRow(pool, league);
          const saved = store.upsertLeague(persisted);
          store.recalculateForLeague(saved.id);
          mapped.push({
            ...saved,
            scoringSummary: scoringConfirmation(saved),
          });
          if (saved.sleeperDraftId) poller.start(saved.id);
        }
        return { user: sleeperUser, leagues: mapped, limiter: client.limiterSnapshot() };
      } catch (err) {
        return reply.code(502).send({
          error: 'Failed to reach Sleeper',
          detail: err instanceof Error ? err.message : String(err),
          limiter: sharedSleeperLimiter.snapshot(),
        });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/leagues/:id/recalculate',
    { preHandler: authenticate },
    async (req, reply) => {
      if (reply.sent) return;
      const user = requireUser(req);
      if (!(await ownedLeague(store, pool, user.sub, req.params.id))) {
        return reply.code(404).send({ error: 'League not found' });
      }
      const result = store.recalculateForLeague(req.params.id);
      if (!result) return reply.code(404).send({ error: 'League not found' });
      return result;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/leagues/:id/scoring-summary',
    { preHandler: authenticate },
    async (req, reply) => {
      if (reply.sent) return;
      const user = requireUser(req);
      if (!(await ownedLeague(store, pool, user.sub, req.params.id))) {
        return reply.code(404).send({ error: 'League not found' });
      }
      const summary = store.scoringSummary(req.params.id);
      if (!summary) return reply.code(404).send({ error: 'League not found' });
      return summary;
    },
  );

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      strategyId: StrategyId;
      draftSlot: number;
      sleeperDraftId: string;
      name: string;
    }>;
  }>('/api/leagues/:id', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const user = requireUser(req);
    if (!(await ownedLeague(store, pool, user.sub, req.params.id))) {
      return reply.code(404).send({ error: 'League not found' });
    }
    const persisted = await updateLeagueRow(pool, user.sub, req.params.id, req.body);
    if (!persisted) return reply.code(404).send({ error: 'League not found' });
    const league = store.updateLeague(req.params.id, persisted);
    if (!league) return reply.code(404).send({ error: 'League not found' });
    if (req.body.sleeperDraftId) poller.start(league.id);
    return { ...league, scoringSummary: scoringConfirmation(league) };
  });

  const guardedGet = (
    path: string,
    handler: (leagueId: string) => unknown,
  ) => {
    app.get<{ Params: { id: string } }>(path, { preHandler: authenticate }, async (req, reply) => {
      if (reply.sent) return;
      const user = requireUser(req);
      if (!(await ownedLeague(store, pool, user.sub, req.params.id))) {
        return reply.code(404).send({ error: 'League not found' });
      }
      const result = handler(req.params.id);
      if (result == null) return reply.code(404).send({ error: 'League not found' });
      return result;
    });
  };

  guardedGet('/api/leagues/:id/board', (id) => store.getBoard(id));
  guardedGet('/api/leagues/:id/draft', (id) => store.getDraft(id));
  guardedGet('/api/leagues/:id/adherence', (id) => store.adherence(id));
  guardedGet('/api/leagues/:id/recap', (id) => store.recap(id));
  guardedGet('/api/leagues/:id/flags', (id) => store.getFlags(id));

  app.post<{ Params: { id: string } }>(
    '/api/leagues/:id/draft/start-polling',
    { preHandler: authenticate },
    async (req, reply) => {
      if (reply.sent) return;
      const user = requireUser(req);
      const league = await ownedLeague(store, pool, user.sub, req.params.id);
      if (!league?.sleeperDraftId) {
        return reply.code(400).send({ error: 'League has no Sleeper draft id — use manual picks' });
      }
      store.patchDraft(req.params.id, { syncMode: 'polling', syncBanner: null });
      poller.start(league.id);
      return store.getDraft(req.params.id);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/leagues/:id/draft/manual-mode',
    { preHandler: authenticate },
    async (req, reply) => {
      if (reply.sent) return;
      const user = requireUser(req);
      if (!(await ownedLeague(store, pool, user.sub, req.params.id))) {
        return reply.code(404).send({ error: 'Draft not found' });
      }
      const draft = store.patchDraft(req.params.id, {
        syncMode: 'manual',
        syncBanner: 'Manual pick entry — Sleeper polling paused.',
      });
      if (!draft) return reply.code(404).send({ error: 'Draft not found' });
      poller.stop(req.params.id);
      return draft;
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      pickNumber: number;
      round: number;
      slot: number;
      playerId: string;
      rosterId?: string;
    };
  }>('/api/leagues/:id/draft/picks', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const user = requireUser(req);
    if (!(await ownedLeague(store, pool, user.sub, req.params.id))) {
      return reply.code(404).send({ error: 'Draft not found' });
    }
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

  app.post<{
    Params: { id: string };
    Body: { playerId: string; kind: 'target' | 'avoid'; value?: boolean };
  }>('/api/leagues/:id/flags', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const user = requireUser(req);
    if (!(await ownedLeague(store, pool, user.sub, req.params.id))) {
      return reply.code(404).send({ error: 'League not found' });
    }
    store.setFlag(req.params.id, req.body.playerId, req.body.kind, req.body.value ?? true);
    return { ok: true, ...store.getFlags(req.params.id) };
  });

}

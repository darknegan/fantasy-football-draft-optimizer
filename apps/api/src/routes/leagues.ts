import type { FastifyInstance } from 'fastify';
import type { StrategyId } from '@draftlab/domain';
import {
  createManualLeague,
  DEFAULT_ROSTER_12,
  mapSleeperLeague,
  SCORING_PRESETS,
  SleeperClient,
} from '@draftlab/integrations';
import type { AppStore } from '../services/store.js';
import type { DraftPoller } from '../services/draft-poller.js';

export async function leagueRoutes(app: FastifyInstance, store: AppStore, poller: DraftPoller) {
  app.get('/api/leagues', async () => store.listLeagues());

  app.get<{ Params: { id: string } }>('/api/leagues/:id', async (req, reply) => {
    const league = store.getLeague(req.params.id);
    if (!league) return reply.code(404).send({ error: 'League not found' });
    return league;
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
    };
  }>('/api/leagues/manual', async (req) => {
    const scoring =
      SCORING_PRESETS.find((p) => p.id === req.body.scoringPresetId) ?? SCORING_PRESETS[0]!;
    const league = createManualLeague({
      name: req.body.name,
      teamCount: req.body.teamCount,
      season: req.body.season ?? 2025,
      scoring,
      roster: DEFAULT_ROSTER_12,
      draftSlot: req.body.draftSlot,
      strategyId: req.body.strategyId ?? 'balanced',
    });
    return store.upsertLeague(league);
  });

  app.post<{ Body: { username: string; season?: number } }>('/api/leagues/sleeper/connect', async (req, reply) => {
    const client = new SleeperClient();
    try {
      const user = await client.getUser(req.body.username);
      const season = req.body.season ?? 2025;
      const leagues = await client.getUserLeagues(user.user_id, season);
      const mapped = leagues.map((l) => {
        const league = mapSleeperLeague(l);
        league.sleeperUserId = user.user_id;
        return store.upsertLeague(league);
      });
      return { user, leagues: mapped };
    } catch (err) {
      return reply.code(502).send({
        error: 'Failed to reach Sleeper',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { strategyId?: StrategyId; draftSlot?: number; sleeperDraftId?: string };
  }>('/api/leagues/:id', async (req, reply) => {
    const league = store.updateLeague(req.params.id, req.body);
    if (!league) return reply.code(404).send({ error: 'League not found' });
    if (req.body.sleeperDraftId) poller.start(league.id);
    return league;
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
    return { draft: updated, board: store.getBoard(req.params.id) };
  });

  app.post<{ Params: { id: string }; Body: { playerId: string; kind: 'target' | 'avoid'; value?: boolean } }>(
    '/api/leagues/:id/flags',
    async (req, reply) => {
      if (!store.getLeague(req.params.id)) return reply.code(404).send({ error: 'League not found' });
      store.setFlag(req.params.id, req.body.playerId, req.body.kind, req.body.value ?? true);
      return { ok: true };
    },
  );
}

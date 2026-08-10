import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { ContractRules, DynastyMode } from '@draftlab/domain';
import { authenticate } from '../auth/plugin.js';
import { requireOwnedLeague } from '../auth/ownership.js';
import type { AppStore } from '../services/store.js';

export async function formatRoutes(app: FastifyInstance, store: AppStore, pool: Pool) {
  const auth = { preHandler: authenticate };

  app.get<{ Params: { id: string } }>('/api/leagues/:id/dynasty', auth, async (req, reply) => {
    if (!(await requireOwnedLeague(req, reply, store, pool))) return;
    const overview = store.dynastyOverview(req.params.id);
    if (!overview) return reply.code(404).send({ error: 'League not found' });
    return overview;
  });

  app.post<{ Params: { id: string }; Body: { mode: DynastyMode } }>(
    '/api/leagues/:id/dynasty/mode',
    auth,
    async (req, reply) => {
      if (!(await requireOwnedLeague(req, reply, store, pool))) return;
      const league = store.setDynastyMode(req.params.id, req.body.mode);
      if (!league) return reply.code(404).send({ error: 'League not found' });
      return store.dynastyOverview(req.params.id);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/leagues/:id/auction/values',
    auth,
    async (req, reply) => {
      if (!(await requireOwnedLeague(req, reply, store, pool))) return;
      const state = store.auctionState(req.params.id);
      if (!state) return reply.code(404).send({ error: 'League not found' });
      return state;
    },
  );

  app.post<{
    Params: { id: string };
    Body: { playerId: string; amount: number; rosterId?: string; contractYears?: number };
  }>('/api/leagues/:id/auction/bid', auth, async (req, reply) => {
    if (!(await requireOwnedLeague(req, reply, store, pool))) return;
    const result = store.placeAuctionBid(req.params.id, req.body);
    if (!result) return reply.code(404).send({ error: 'League not found' });
    if ('error' in result) return reply.code(400).send(result);
    return result;
  });

  app.get<{ Params: { id: string }; Querystring: { playerId?: string } }>(
    '/api/leagues/:id/auction/max-bid',
    auth,
    async (req, reply) => {
      if (!(await requireOwnedLeague(req, reply, store, pool))) return;
      const playerId = req.query.playerId;
      if (!playerId) return reply.code(400).send({ error: 'playerId required' });
      const result = store.auctionMaxBid(req.params.id, playerId);
      if (!result) return reply.code(404).send({ error: 'League not found' });
      return result;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/leagues/:id/auction/nominations',
    auth,
    async (req, reply) => {
      if (!(await requireOwnedLeague(req, reply, store, pool))) return;
      const state = store.auctionState(req.params.id);
      if (!state) return reply.code(404).send({ error: 'League not found' });
      return { nominations: state.nominations, inflationRate: state.inflationRate };
    },
  );

  app.post<{
    Params: { id: string };
    Body: { playerId: string; annualSalary: number; years: number };
  }>('/api/leagues/:id/auction/contract-preview', auth, async (req, reply) => {
    if (!(await requireOwnedLeague(req, reply, store, pool))) return;
    const result = store.auctionContractPreview(req.params.id, req.body);
    if (!result) return reply.code(404).send({ error: 'Player or league not found' });
    return result;
  });

  app.put<{ Params: { id: string }; Body: Partial<ContractRules> }>(
    '/api/leagues/:id/auction/contract-rules',
    auth,
    async (req, reply) => {
      if (!(await requireOwnedLeague(req, reply, store, pool))) return;
      const rules = store.setContractRules(req.params.id, req.body);
      if (!rules) return reply.code(404).send({ error: 'League not found' });
      return rules;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/leagues/:id/calibration',
    auth,
    async (req, reply) => {
      if (!(await requireOwnedLeague(req, reply, store, pool))) return;
      const summary = store.calibrationSummary(req.params.id);
      if (!summary) return reply.code(404).send({ error: 'League not found' });
      return summary;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/leagues/:id/calibration/propose',
    auth,
    async (req, reply) => {
      if (!(await requireOwnedLeague(req, reply, store, pool))) return;
      const proposal = store.proposeLeagueCalibration(req.params.id);
      if (!proposal) return reply.code(404).send({ error: 'League not found' });
      return proposal;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/leagues/:id/calibration/apply',
    auth,
    async (req, reply) => {
      if (!(await requireOwnedLeague(req, reply, store, pool))) return;
      const applied = store.applyLeagueCalibration(req.params.id);
      if (!applied) return reply.code(404).send({ error: 'League not found' });
      return applied;
    },
  );
}

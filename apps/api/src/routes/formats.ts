import type { FastifyInstance } from 'fastify';
import type { ContractRules, DynastyMode } from '@draftlab/domain';
import type { AppStore } from '../services/store.js';

export async function formatRoutes(app: FastifyInstance, store: AppStore) {
  // Dynasty
  app.get<{ Params: { id: string } }>('/api/leagues/:id/dynasty', async (req, reply) => {
    const overview = store.dynastyOverview(req.params.id);
    if (!overview) return reply.code(404).send({ error: 'League not found' });
    return overview;
  });

  app.post<{ Params: { id: string }; Body: { mode: DynastyMode } }>(
    '/api/leagues/:id/dynasty/mode',
    async (req, reply) => {
      const league = store.setDynastyMode(req.params.id, req.body.mode);
      if (!league) return reply.code(404).send({ error: 'League not found' });
      return store.dynastyOverview(req.params.id);
    },
  );

  // Auction
  app.get<{ Params: { id: string } }>('/api/leagues/:id/auction/values', async (req, reply) => {
    const state = store.auctionState(req.params.id);
    if (!state) return reply.code(404).send({ error: 'League not found' });
    return state;
  });

  app.post<{
    Params: { id: string };
    Body: { playerId: string; amount: number; rosterId?: string; contractYears?: number };
  }>('/api/leagues/:id/auction/bid', async (req, reply) => {
    const result = store.placeAuctionBid(req.params.id, req.body);
    if (!result) return reply.code(404).send({ error: 'League not found' });
    if ('error' in result) return reply.code(400).send(result);
    return result;
  });

  app.get<{ Params: { id: string }; Querystring: { playerId?: string } }>(
    '/api/leagues/:id/auction/max-bid',
    async (req, reply) => {
      const playerId = req.query.playerId;
      if (!playerId) return reply.code(400).send({ error: 'playerId required' });
      const result = store.auctionMaxBid(req.params.id, playerId);
      if (!result) return reply.code(404).send({ error: 'League not found' });
      return result;
    },
  );

  app.get<{ Params: { id: string } }>('/api/leagues/:id/auction/nominations', async (req, reply) => {
    const state = store.auctionState(req.params.id);
    if (!state) return reply.code(404).send({ error: 'League not found' });
    return { nominations: state.nominations, inflationRate: state.inflationRate };
  });

  app.post<{
    Params: { id: string };
    Body: { playerId: string; annualSalary: number; years: number };
  }>('/api/leagues/:id/auction/contract-preview', async (req, reply) => {
    const result = store.auctionContractPreview(req.params.id, req.body);
    if (!result) return reply.code(404).send({ error: 'Player or league not found' });
    return result;
  });

  app.put<{ Params: { id: string }; Body: Partial<ContractRules> }>(
    '/api/leagues/:id/auction/contract-rules',
    async (req, reply) => {
      const rules = store.setContractRules(req.params.id, req.body);
      if (!rules) return reply.code(404).send({ error: 'League not found' });
      return rules;
    },
  );

  // Calibration
  app.get<{ Params: { id: string } }>('/api/leagues/:id/calibration', async (req, reply) => {
    const summary = store.calibrationSummary(req.params.id);
    if (!summary) return reply.code(404).send({ error: 'League not found' });
    return summary;
  });

  app.post<{ Params: { id: string } }>('/api/leagues/:id/calibration/propose', async (req, reply) => {
    const proposal = store.proposeLeagueCalibration(req.params.id);
    if (!proposal) return reply.code(404).send({ error: 'League not found' });
    return proposal;
  });

  app.post<{ Params: { id: string } }>('/api/leagues/:id/calibration/apply', async (req, reply) => {
    const applied = store.applyLeagueCalibration(req.params.id);
    if (!applied) return reply.code(404).send({ error: 'League not found' });
    return applied;
  });
}

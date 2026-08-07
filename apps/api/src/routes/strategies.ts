import type { FastifyInstance } from 'fastify';
import type { StrategyId } from '@draftlab/domain';
import { getDraftSlotInfo } from '@draftlab/strategy-engine';
import type { AppStore } from '../services/store.js';

export async function strategyRoutes(app: FastifyInstance, store: AppStore) {
  app.get('/api/strategies', async () => store.strategies());

  app.get<{ Querystring: { slot?: string; teamCount?: string; rounds?: string } }>(
    '/api/draft-slots',
    async (req) => {
      const teamCount = Number(req.query.teamCount ?? 12);
      const rounds = Number(req.query.rounds ?? 15);
      if (req.query.slot) {
        return getDraftSlotInfo(Number(req.query.slot), teamCount, rounds);
      }
      return Array.from({ length: teamCount }, (_, i) => getDraftSlotInfo(i + 1, teamCount, rounds));
    },
  );

  app.post<{
    Params: { id: string };
    Body: { strategyId?: StrategyId; iterations?: number; rounds?: number; seed?: number };
  }>('/api/leagues/:id/simulate', async (req, reply) => {
    const result = store.simulate(req.params.id, req.body ?? {});
    if (!result) return reply.code(404).send({ error: 'League not found' });
    return result;
  });

  app.post<{
    Params: { id: string };
    Body: { strategyIds?: StrategyId[]; iterations?: number; rounds?: number; seed?: number };
  }>('/api/leagues/:id/compare-strategies', async (req, reply) => {
    const result = store.compare(req.params.id, req.body ?? {});
    if (!result) return reply.code(404).send({ error: 'League not found' });
    return result;
  });

  app.get<{ Params: { id: string } }>('/api/leagues/:id/cheat-sheet', async (req, reply) => {
    const result = store.cheatSheet(req.params.id);
    if (!result) return reply.code(404).send({ error: 'League not found' });
    return result;
  });
}

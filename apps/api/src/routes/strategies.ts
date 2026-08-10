import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { StrategyId } from '@draftlab/domain';
import { getDraftSlotInfo } from '@draftlab/strategy-engine';
import { authenticate } from '../auth/plugin.js';
import { requireOwnedLeague } from '../auth/ownership.js';
import type { AppStore } from '../services/store.js';

export async function strategyRoutes(app: FastifyInstance, store: AppStore, pool: Pool) {
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
    Body: {
      strategyId?: StrategyId;
      iterations?: number;
      rounds?: number;
      seed?: number;
      draftSlot?: number;
      adpVarianceRatio?: number;
      adpVarianceFloor?: number;
    };
  }>('/api/leagues/:id/simulate', { preHandler: authenticate }, async (req, reply) => {
    if (!(await requireOwnedLeague(req, reply, store, pool))) return;
    const result = store.simulate(req.params.id, req.body ?? {});
    if (!result) return reply.code(404).send({ error: 'League not found' });
    return result;
  });

  app.post<{
    Params: { id: string };
    Body: {
      strategyIds?: StrategyId[];
      iterations?: number;
      rounds?: number;
      seed?: number;
      draftSlot?: number;
      adpVarianceRatio?: number;
      adpVarianceFloor?: number;
    };
  }>('/api/leagues/:id/compare-strategies', { preHandler: authenticate }, async (req, reply) => {
    if (!(await requireOwnedLeague(req, reply, store, pool))) return;
    const result = store.compare(req.params.id, req.body ?? {});
    if (!result) return reply.code(404).send({ error: 'League not found' });
    return result;
  });

  app.get<{ Params: { id: string } }>(
    '/api/leagues/:id/cheat-sheet',
    { preHandler: authenticate },
    async (req, reply) => {
      if (!(await requireOwnedLeague(req, reply, store, pool))) return;
      const result = store.cheatSheet(req.params.id);
      if (!result) return reply.code(404).send({ error: 'League not found' });
      return result;
    },
  );
}

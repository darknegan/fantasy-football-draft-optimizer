import type { FastifyInstance } from 'fastify';
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
}

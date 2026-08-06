import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../services/store.js';

export async function playerRoutes(app: FastifyInstance, store: AppStore) {
  app.get('/api/players', async () => {
    return store.listPlayers().map((player) => ({
      player,
      evaluation: store.getEvaluation(player.id),
    }));
  });

  app.get<{ Params: { id: string } }>('/api/players/:id', async (req, reply) => {
    const player = store.getPlayer(req.params.id);
    if (!player) return reply.code(404).send({ error: 'Player not found' });
    return {
      player,
      evaluation: store.getEvaluation(player.id),
    };
  });
}

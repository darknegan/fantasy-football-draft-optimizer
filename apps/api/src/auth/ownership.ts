import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { League } from '@draftlab/domain';
import { getLeagueForUser } from '../db/leagues.js';
import type { AppStore } from '../services/store.js';
import { requireUser } from './plugin.js';

export async function requireOwnedLeague(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
  store: AppStore,
  pool: Pool,
): Promise<League | null> {
  if (reply.sent) return null;
  const user = requireUser(req);
  const memory = store.assertOwns(user.sub, req.params.id);
  if (memory) return memory;
  const fromDb = await getLeagueForUser(pool, user.sub, req.params.id);
  if (!fromDb) {
    reply.code(404).send({ error: 'League not found' });
    return null;
  }
  store.hydrateLeagues([fromDb]);
  return fromDb;
}

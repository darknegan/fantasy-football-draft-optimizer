import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { createUser, findUserByEmail, findUserById } from '../db/users.js';
import { authenticate, requireUser } from '../auth/plugin.js';
import { hashPassword, validateEmail, validatePassword, verifyPassword } from '../auth/password.js';
import { REFRESH_COOKIE } from '../auth/tokens.js';
import { clearRefreshSession, issueSession, publicUser, rotateRefreshSession } from '../auth/session.js';

export async function authRoutes(app: FastifyInstance, pool: Pool) {
  app.post<{
    Body: { email?: string; password?: string; displayName?: string };
  }>('/auth/register', async (req, reply) => {
    const email = (req.body.email ?? '').trim();
    const password = req.body.password ?? '';
    const displayName = (req.body.displayName ?? '').trim();
    const emailErr = validateEmail(email);
    if (emailErr) return reply.code(400).send({ error: emailErr });
    const passErr = validatePassword(password);
    if (passErr) return reply.code(400).send({ error: passErr });
    if (!displayName) return reply.code(400).send({ error: 'Display name is required' });

    const existing = await findUserByEmail(pool, email);
    if (existing) return reply.code(409).send({ error: 'Email already registered' });

    const passwordHash = await hashPassword(password);
    const user = await createUser(pool, { email, displayName, passwordHash });
    const session = await issueSession(pool, reply, user);
    return reply.code(201).send(session);
  });

  app.post<{ Body: { email?: string; password?: string } }>('/auth/login', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    handler: async (req, reply) => {
      const email = (req.body.email ?? '').trim();
      const password = req.body.password ?? '';
      const user = await findUserByEmail(pool, email);
      const ok = user ? await verifyPassword(user.passwordHash, password) : false;
      if (!user || !ok) {
        return reply.code(401).send({ error: 'Invalid email or password' });
      }
      return issueSession(pool, reply, user);
    },
  });

  app.post('/auth/refresh', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    const session = await rotateRefreshSession(pool, reply, token, (id) => findUserById(pool, id));
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });
    return session;
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    await clearRefreshSession(pool, reply, token);
    return { ok: true };
  });

  app.get('/me', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const claims = requireUser(req);
    const user = await findUserById(pool, claims.sub);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    return publicUser(user);
  });
}

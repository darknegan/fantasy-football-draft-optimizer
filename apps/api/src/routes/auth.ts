import {
  isValidTimeZone,
  mergeUserPreferences,
  normalizeInitialsColor,
  type UserPreferences,
} from '@draftlab/domain';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  createUser,
  deleteUser,
  findUserByEmail,
  findUserById,
  updateUserPassword,
  updateUserProfile,
} from '../db/users.js';
import {
  listSessionsForUser,
  revokeAllRefreshTokensForUser,
  revokeSessionForUser,
} from '../db/refresh-tokens.js';
import { authenticate, requireUser } from '../auth/plugin.js';
import { hashPassword, validateEmail, validatePassword, verifyPassword } from '../auth/password.js';
import { REFRESH_COOKIE } from '../auth/tokens.js';
import {
  clearRefreshSession,
  issueSession,
  publicUserWithCounts,
  rotateRefreshSession,
} from '../auth/session.js';
import { listLeaguesForUser } from '../db/leagues.js';

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
    const session = await issueSession(pool, reply, user, req);
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
      return issueSession(pool, reply, user, req);
    },
  });

  app.post('/auth/refresh', async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (!token) return reply.code(401).send({ error: 'Unauthorized' });
    const session = await rotateRefreshSession(
      pool,
      reply,
      token,
      (id) => findUserById(pool, id),
      req,
    );
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
    return publicUserWithCounts(pool, user);
  });

  app.patch<{
    Body: {
      displayName?: string;
      email?: string;
      timeZone?: string;
      initialsColor?: string;
      preferences?: Partial<UserPreferences>;
    };
  }>('/me', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const claims = requireUser(req);
    const user = await findUserById(pool, claims.sub);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });

    const body = req.body ?? {};
    if (typeof body.email === 'string' && body.email.trim().toLowerCase() !== user.email) {
      return reply.code(400).send({
        error: 'Email changes require confirmation, which is not available yet',
      });
    }

    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim() : undefined;
    if (displayName !== undefined && !displayName) {
      return reply.code(400).send({ error: 'Display name is required' });
    }

    const timeZone = typeof body.timeZone === 'string' ? body.timeZone.trim() : undefined;
    if (timeZone !== undefined && !isValidTimeZone(timeZone)) {
      return reply.code(400).send({ error: 'Invalid time zone' });
    }

    const initialsColor =
      body.initialsColor !== undefined
        ? normalizeInitialsColor(body.initialsColor, user.initialsColor)
        : undefined;

    const preferences =
      body.preferences !== undefined
        ? mergeUserPreferences(body.preferences, user.preferences)
        : undefined;

    const updated = await updateUserProfile(pool, user.id, {
      displayName,
      timeZone,
      initialsColor,
      preferences,
    });
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return publicUserWithCounts(pool, updated);
  });

  app.post<{
    Body: { currentPassword?: string; newPassword?: string };
  }>('/me/password', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const claims = requireUser(req);
    const user = await findUserById(pool, claims.sub);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });

    const currentPassword = req.body.currentPassword ?? '';
    const newPassword = req.body.newPassword ?? '';
    const passErr = validatePassword(newPassword);
    if (passErr) return reply.code(400).send({ error: passErr });
    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) return reply.code(401).send({ error: 'Current password is incorrect' });

    await updateUserPassword(pool, user.id, await hashPassword(newPassword));
    return { ok: true };
  });

  app.get('/me/sessions', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const claims = requireUser(req);
    const current = req.cookies[REFRESH_COOKIE];
    const sessions = await listSessionsForUser(pool, claims.sub, current);
    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        label: s.label ?? 'Unknown device',
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        current: s.current,
      })),
    };
  });

  app.delete<{ Params: { id: string } }>(
    '/me/sessions/:id',
    { preHandler: authenticate },
    async (req, reply) => {
      if (reply.sent) return;
      const claims = requireUser(req);
      const revoked = await revokeSessionForUser(pool, claims.sub, req.params.id);
      if (!revoked) return reply.code(404).send({ error: 'Session not found' });
      return { ok: true };
    },
  );

  app.post('/me/sessions/revoke-all', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const claims = requireUser(req);
    const current = req.cookies[REFRESH_COOKIE];
    const count = await revokeAllRefreshTokensForUser(pool, claims.sub, current);
    return { ok: true, revoked: count };
  });

  app.get('/me/export', { preHandler: authenticate }, async (req, reply) => {
    if (reply.sent) return;
    const claims = requireUser(req);
    const user = await findUserById(pool, claims.sub);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    const leagues = await listLeaguesForUser(pool, user.id);
    return {
      exportedAt: new Date().toISOString(),
      user: await publicUserWithCounts(pool, user),
      leagues,
    };
  });

  app.delete<{ Body: { password?: string } }>(
    '/me',
    { preHandler: authenticate },
    async (req, reply) => {
      if (reply.sent) return;
      const claims = requireUser(req);
      const user = await findUserById(pool, claims.sub);
      if (!user) return reply.code(401).send({ error: 'Unauthorized' });
      const password = req.body?.password ?? '';
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) return reply.code(401).send({ error: 'Password is incorrect' });
      await deleteUser(pool, user.id);
      await clearRefreshSession(pool, reply, req.cookies[REFRESH_COOKIE]);
      return { ok: true };
    },
  );
}

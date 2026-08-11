import {
  isValidTimeZone,
  mergeUserPreferences,
  normalizeInitialsColor,
  type UserPreferences,
} from '@draftlab/domain';
import { getCookie } from 'hono/cookie';
import { Hono } from 'hono';
import { createDb, endDb } from '../db/client.js';
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
import {
  hashPassword,
  validateEmail,
  validatePassword,
  verifyPassword,
} from '../password.js';
import { requireAccessJwt, type WorkerUser } from '../auth.js';
import {
  clearRefreshSession,
  issueSession,
  publicUserWithCounts,
  REFRESH_COOKIE,
  rotateRefreshSession,
} from '../session.js';
import { listLeaguesForUser } from '../db/leagues.js';

export const authRoutes = new Hono<{
  Bindings: Env;
  Variables: { user: WorkerUser };
}>();

authRoutes.post('/auth/register', async (c) => {
  const body = await c.req.json<{
    email?: string;
    password?: string;
    displayName?: string;
  }>();
  const email = (body.email ?? '').trim();
  const password = body.password ?? '';
  const displayName = (body.displayName ?? '').trim();
  const emailErr = validateEmail(email);
  if (emailErr) return c.json({ error: emailErr }, 400);
  const passErr = validatePassword(password);
  if (passErr) return c.json({ error: passErr }, 400);
  if (!displayName) return c.json({ error: 'Display name is required' }, 400);

  const db = createDb(c.env);
  try {
    const existing = await findUserByEmail(db, email);
    if (existing) return c.json({ error: 'Email already registered' }, 409);
    const passwordHash = await hashPassword(password);
    const user = await createUser(db, { email, displayName, passwordHash });
    const session = await issueSession(c, db, user);
    return c.json(session, 201);
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.post('/auth/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = (body.email ?? '').trim();
  const password = body.password ?? '';
  const db = createDb(c.env);
  try {
    const user = await findUserByEmail(db, email);
    const ok = user ? await verifyPassword(user.passwordHash, password) : false;
    if (!user || !ok) return c.json({ error: 'Invalid email or password' }, 401);
    return c.json(await issueSession(c, db, user));
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.post('/auth/refresh', async (c) => {
  const db = createDb(c.env);
  try {
    const session = await rotateRefreshSession(c, db);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return c.json(session);
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.post('/auth/logout', async (c) => {
  const db = createDb(c.env);
  try {
    await clearRefreshSession(c, db);
    return c.json({ ok: true });
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.get('/me', requireAccessJwt, async (c) => {
  const claims = c.get('user');
  const db = createDb(c.env);
  try {
    const user = await findUserById(db, claims.sub);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return c.json(await publicUserWithCounts(db, user));
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.patch('/me', requireAccessJwt, async (c) => {
  const claims = c.get('user');
  const body = await c.req.json<{
    displayName?: string;
    email?: string;
    timeZone?: string;
    initialsColor?: string;
    preferences?: Partial<UserPreferences>;
  }>();
  const db = createDb(c.env);
  try {
    const user = await findUserById(db, claims.sub);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (typeof body.email === 'string' && body.email.trim().toLowerCase() !== user.email) {
      return c.json(
        { error: 'Email changes require confirmation, which is not available yet' },
        400,
      );
    }
    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim() : undefined;
    if (displayName !== undefined && !displayName) {
      return c.json({ error: 'Display name is required' }, 400);
    }
    const timeZone = typeof body.timeZone === 'string' ? body.timeZone.trim() : undefined;
    if (timeZone !== undefined && !isValidTimeZone(timeZone)) {
      return c.json({ error: 'Invalid time zone' }, 400);
    }
    const initialsColor =
      body.initialsColor !== undefined
        ? normalizeInitialsColor(body.initialsColor, user.initialsColor)
        : undefined;
    const preferences =
      body.preferences !== undefined
        ? mergeUserPreferences(body.preferences, user.preferences)
        : undefined;
    const updated = await updateUserProfile(db, user.id, {
      displayName,
      timeZone,
      initialsColor,
      preferences,
    });
    if (!updated) return c.json({ error: 'Not found' }, 404);
    return c.json(await publicUserWithCounts(db, updated));
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.post('/me/password', requireAccessJwt, async (c) => {
  const claims = c.get('user');
  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>();
  const db = createDb(c.env);
  try {
    const user = await findUserById(db, claims.sub);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const currentPassword = body.currentPassword ?? '';
    const newPassword = body.newPassword ?? '';
    const passErr = validatePassword(newPassword);
    if (passErr) return c.json({ error: passErr }, 400);
    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) return c.json({ error: 'Current password is incorrect' }, 401);
    await updateUserPassword(db, user.id, await hashPassword(newPassword));
    return c.json({ ok: true });
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.get('/me/sessions', requireAccessJwt, async (c) => {
  const claims = c.get('user');
  const db = createDb(c.env);
  try {
    const current = getCookie(c, REFRESH_COOKIE);
    const sessions = await listSessionsForUser(db, claims.sub, current);
    return c.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        label: s.label ?? 'Unknown device',
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        current: s.current,
      })),
    });
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.delete('/me/sessions/:id', requireAccessJwt, async (c) => {
  const claims = c.get('user');
  const db = createDb(c.env);
  try {
    const revoked = await revokeSessionForUser(db, claims.sub, c.req.param('id'));
    if (!revoked) return c.json({ error: 'Session not found' }, 404);
    return c.json({ ok: true });
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.post('/me/sessions/revoke-all', requireAccessJwt, async (c) => {
  const claims = c.get('user');
  const db = createDb(c.env);
  try {
    const current = getCookie(c, REFRESH_COOKIE);
    const count = await revokeAllRefreshTokensForUser(db, claims.sub, current);
    return c.json({ ok: true, revoked: count });
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.get('/me/export', requireAccessJwt, async (c) => {
  const claims = c.get('user');
  const db = createDb(c.env);
  try {
    const user = await findUserById(db, claims.sub);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const leagues = await listLeaguesForUser(db, user.id);
    return c.json({
      exportedAt: new Date().toISOString(),
      user: await publicUserWithCounts(db, user),
      leagues,
    });
  } finally {
    await endDb(db, c.executionCtx);
  }
});

authRoutes.delete('/me', requireAccessJwt, async (c) => {
  const claims = c.get('user');
  const body = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  const db = createDb(c.env);
  try {
    const user = await findUserById(db, claims.sub);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const ok = await verifyPassword(user.passwordHash, body.password ?? '');
    if (!ok) return c.json({ error: 'Password is incorrect' }, 401);
    await deleteUser(db, user.id);
    await clearRefreshSession(c, db);
    return c.json({ ok: true });
  } finally {
    await endDb(db, c.executionCtx);
  }
});

import { Hono } from 'hono';
import { createSql, endSql } from '../db/client.js';
import { createUser, findUserByEmail, findUserById } from '../db/users.js';
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
  publicUser,
  rotateRefreshSession,
} from '../session.js';

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

  const sql = createSql(c.env);
  try {
    const existing = await findUserByEmail(sql, email);
    if (existing) return c.json({ error: 'Email already registered' }, 409);
    const passwordHash = await hashPassword(password);
    const user = await createUser(sql, { email, displayName, passwordHash });
    const session = await issueSession(c, sql, user);
    return c.json(session, 201);
  } finally {
    await endSql(sql, c.executionCtx);
  }
});

authRoutes.post('/auth/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = (body.email ?? '').trim();
  const password = body.password ?? '';
  const sql = createSql(c.env);
  try {
    const user = await findUserByEmail(sql, email);
    const ok = user ? await verifyPassword(user.passwordHash, password) : false;
    if (!user || !ok) return c.json({ error: 'Invalid email or password' }, 401);
    return c.json(await issueSession(c, sql, user));
  } finally {
    await endSql(sql, c.executionCtx);
  }
});

authRoutes.post('/auth/refresh', async (c) => {
  const sql = createSql(c.env);
  try {
    const session = await rotateRefreshSession(c, sql);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return c.json(session);
  } finally {
    await endSql(sql, c.executionCtx);
  }
});

authRoutes.post('/auth/logout', async (c) => {
  const sql = createSql(c.env);
  try {
    await clearRefreshSession(c, sql);
    return c.json({ ok: true });
  } finally {
    await endSql(sql, c.executionCtx);
  }
});

authRoutes.get('/me', requireAccessJwt, async (c) => {
  const claims = c.get('user');
  const sql = createSql(c.env);
  try {
    const user = await findUserById(sql, claims.sub);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return c.json(publicUser(user));
  } finally {
    await endSql(sql, c.executionCtx);
  }
});

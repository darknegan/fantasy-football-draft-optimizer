import type { FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { DbUser } from '../db/users.js';
import {
  generateRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenById,
  storeRefreshToken,
  findValidRefreshToken,
} from '../db/refresh-tokens.js';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  refreshExpiresAt,
  signAccessToken,
} from './tokens.js';

export function publicUser(user: DbUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

export async function issueSession(pool: Pool, reply: FastifyReply, user: DbUser) {
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
  });
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(pool, {
    userId: user.id,
    token: refreshToken,
    expiresAt: refreshExpiresAt(),
  });
  reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return {
    accessToken,
    user: publicUser(user),
  };
}

export async function rotateRefreshSession(
  pool: Pool,
  reply: FastifyReply,
  refreshToken: string,
  loadUser: (id: string) => Promise<DbUser | null>,
) {
  const existing = await findValidRefreshToken(pool, refreshToken);
  if (!existing) return null;
  await revokeRefreshTokenById(pool, existing.id);
  const user = await loadUser(existing.userId);
  if (!user) return null;
  return issueSession(pool, reply, user);
}

export async function clearRefreshSession(pool: Pool, reply: FastifyReply, refreshToken?: string) {
  if (refreshToken) await revokeRefreshToken(pool, refreshToken);
  reply.clearCookie(REFRESH_COOKIE, { path: '/auth' });
}

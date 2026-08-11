import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { DbUser } from '../db/users.js';
import { countLeaguesForUser } from '../db/users.js';
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

export function sessionLabelFromUserAgent(userAgent?: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('chrome/')
      ? 'Chrome'
      : ua.includes('firefox/')
        ? 'Firefox'
        : ua.includes('safari/')
          ? 'Safari'
          : 'Browser';
  const os = ua.includes('iphone') || ua.includes('ipad')
    ? 'iPhone'
    : ua.includes('android')
      ? 'Android'
      : ua.includes('mac os')
        ? 'macOS'
        : ua.includes('windows')
          ? 'Windows'
          : ua.includes('linux')
            ? 'Linux'
            : 'Device';
  return `${browser} · ${os}`;
}

export function publicUser(user: DbUser, leagueCount?: number) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    timeZone: user.timeZone,
    initialsColor: user.initialsColor,
    passwordChangedAt: user.passwordChangedAt,
    preferences: user.preferences,
    leagueCount: leagueCount ?? 0,
  };
}

export async function publicUserWithCounts(pool: Pool, user: DbUser) {
  const leagueCount = await countLeaguesForUser(pool, user.id);
  return publicUser(user, leagueCount);
}

export async function issueSession(
  pool: Pool,
  reply: FastifyReply,
  user: DbUser,
  req?: FastifyRequest,
) {
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
  });
  const refreshToken = generateRefreshToken();
  const userAgent = req?.headers['user-agent'] ?? null;
  await storeRefreshToken(pool, {
    userId: user.id,
    token: refreshToken,
    expiresAt: refreshExpiresAt(),
    userAgent,
    label: sessionLabelFromUserAgent(userAgent),
  });
  reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return {
    accessToken,
    user: await publicUserWithCounts(pool, user),
  };
}

export async function rotateRefreshSession(
  pool: Pool,
  reply: FastifyReply,
  refreshToken: string,
  loadUser: (id: string) => Promise<DbUser | null>,
  req?: FastifyRequest,
) {
  const existing = await findValidRefreshToken(pool, refreshToken);
  if (!existing) return null;
  await revokeRefreshTokenById(pool, existing.id);
  const user = await loadUser(existing.userId);
  if (!user) return null;
  return issueSession(pool, reply, user, req);
}

export async function clearRefreshSession(pool: Pool, reply: FastifyReply, refreshToken?: string) {
  if (refreshToken) await revokeRefreshToken(pool, refreshToken);
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}

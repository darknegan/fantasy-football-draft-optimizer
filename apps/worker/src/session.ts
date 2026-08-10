import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { SignJWT } from 'jose';
import type { DbUser } from './db/users.js';
import type { Db } from './db/client.js';
import {
  findValidRefreshToken,
  generateRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenById,
  storeRefreshToken,
} from './db/refresh-tokens.js';
import { findUserById } from './db/users.js';

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;
export const REFRESH_COOKIE = 'draftlab_refresh';

type CookieContext = {
  env: Env;
  header: (name: 'Set-Cookie', value: string) => void;
  req: { header: (name: string) => string | undefined; raw: Request };
};

export function publicUser(user: DbUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

async function signAccessToken(env: Env, claims: { sub: string; email: string; displayName: string }) {
  const secret = env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is required');
  return new SignJWT({
    email: claims.email,
    displayName: claims.displayName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(new TextEncoder().encode(secret));
}

function refreshExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_DAYS);
  return d;
}

function cookieSecure(env: Env): boolean {
  return env.AUTH_COOKIE_SECURE !== 'false';
}

export async function issueSession(c: CookieContext, db: Db, user: DbUser) {
  const accessToken = await signAccessToken(c.env, {
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
  });
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(db, {
    userId: user.id,
    token: refreshToken,
    expiresAt: refreshExpiresAt(),
  });
  setCookie(c as never, REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: cookieSecure(c.env),
    sameSite: 'Lax',
    path: '/auth',
    maxAge: REFRESH_DAYS * 24 * 60 * 60,
  });
  return {
    accessToken,
    user: publicUser(user),
  };
}

export async function rotateRefreshSession(c: CookieContext, db: Db) {
  const token = getCookie(c as never, REFRESH_COOKIE);
  if (!token) return null;
  const existing = await findValidRefreshToken(db, token);
  if (!existing) return null;
  await revokeRefreshTokenById(db, existing.id);
  const user = await findUserById(db, existing.userId);
  if (!user) return null;
  return issueSession(c, db, user);
}

export async function clearRefreshSession(c: CookieContext, db: Db) {
  const token = getCookie(c as never, REFRESH_COOKIE);
  if (token) await revokeRefreshToken(db, token);
  deleteCookie(c as never, REFRESH_COOKIE, { path: '/auth' });
}

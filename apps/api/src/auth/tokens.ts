import { SignJWT, jwtVerify } from 'jose';
import { requireEnv } from '../db/pool.js';

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;

function accessSecret() {
  return new TextEncoder().encode(requireEnv('JWT_ACCESS_SECRET'));
}

function refreshSecret() {
  return new TextEncoder().encode(requireEnv('JWT_REFRESH_SECRET'));
}

export interface AccessClaims {
  sub: string;
  email: string;
  displayName: string;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({
    email: claims.email,
    displayName: claims.displayName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(accessSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, accessSecret());
  if (!payload.sub || typeof payload['email'] !== 'string') {
    throw new Error('Invalid access token');
  }
  return {
    sub: payload.sub,
    email: payload['email'],
    displayName: typeof payload['displayName'] === 'string' ? payload['displayName'] : '',
  };
}

export function refreshExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_DAYS);
  return d;
}

export const REFRESH_COOKIE = 'draftlab_refresh';

export function refreshCookieOptions() {
  const secure = process.env['AUTH_COOKIE_SECURE'] === 'true';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    // Available site-wide so /me/sessions can mark the current device; still httpOnly.
    path: '/',
    maxAge: REFRESH_DAYS * 24 * 60 * 60,
  };
}

/** Exported for Worker JWT verify parity. */
export { accessSecret, refreshSecret };

import type { Sql } from './client.js';

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashRefreshToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

export function generateRefreshToken(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function storeRefreshToken(
  sql: Sql,
  input: { userId: string; token: string; expiresAt: Date },
): Promise<void> {
  const tokenHash = await hashRefreshToken(input.token);
  await sql`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (${input.userId}, ${tokenHash}, ${input.expiresAt.toISOString()})
  `;
}

export async function findValidRefreshToken(
  sql: Sql,
  token: string,
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = await hashRefreshToken(token);
  const rows = await sql`
    SELECT id, user_id
    FROM refresh_tokens
    WHERE token_hash = ${tokenHash}
      AND revoked_at IS NULL
      AND expires_at > now()
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: String(row['id']), userId: String(row['user_id']) };
}

export async function revokeRefreshToken(sql: Sql, token: string): Promise<void> {
  const tokenHash = await hashRefreshToken(token);
  await sql`
    UPDATE refresh_tokens SET revoked_at = now()
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
  `;
}

export async function revokeRefreshTokenById(sql: Sql, id: string): Promise<void> {
  await sql`
    UPDATE refresh_tokens SET revoked_at = now()
    WHERE id = ${id} AND revoked_at IS NULL
  `;
}

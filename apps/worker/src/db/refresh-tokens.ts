import type { Db } from './client.js';

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
  db: Db,
  input: { userId: string; token: string; expiresAt: Date },
): Promise<void> {
  const tokenHash = await hashRefreshToken(input.token);
  if (db.kind === 'supabase') {
    const { error } = await db.sb.from('refresh_tokens').insert({
      user_id: input.userId,
      token_hash: tokenHash,
      expires_at: input.expiresAt.toISOString(),
    });
    if (error) throw new Error(error.message);
    return;
  }

  await db.sql`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (${input.userId}, ${tokenHash}, ${input.expiresAt.toISOString()})
  `;
}

export async function findValidRefreshToken(
  db: Db,
  token: string,
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = await hashRefreshToken(token);
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('refresh_tokens')
      .select('id, user_id, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (new Date(String(data['expires_at'])).getTime() <= Date.now()) return null;
    return { id: String(data['id']), userId: String(data['user_id']) };
  }

  const rows = await db.sql`
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

export async function revokeRefreshToken(db: Db, token: string): Promise<void> {
  const tokenHash = await hashRefreshToken(token);
  if (db.kind === 'supabase') {
    const { error } = await db.sb
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null);
    if (error) throw new Error(error.message);
    return;
  }

  await db.sql`
    UPDATE refresh_tokens SET revoked_at = now()
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
  `;
}

export async function revokeRefreshTokenById(db: Db, id: string): Promise<void> {
  if (db.kind === 'supabase') {
    const { error } = await db.sb
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .is('revoked_at', null);
    if (error) throw new Error(error.message);
    return;
  }

  await db.sql`
    UPDATE refresh_tokens SET revoked_at = now()
    WHERE id = ${id} AND revoked_at IS NULL
  `;
}

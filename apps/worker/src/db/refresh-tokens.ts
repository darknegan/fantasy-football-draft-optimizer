import type { Db } from './client.js';

export interface DbSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
  label: string | null;
  current: boolean;
}

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
  input: {
    userId: string;
    token: string;
    expiresAt: Date;
    userAgent?: string | null;
    label?: string | null;
  },
): Promise<void> {
  const tokenHash = await hashRefreshToken(input.token);
  if (db.kind === 'supabase') {
    const { error } = await db.sb.from('refresh_tokens').insert({
      user_id: input.userId,
      token_hash: tokenHash,
      expires_at: input.expiresAt.toISOString(),
      user_agent: input.userAgent ?? null,
      label: input.label ?? null,
    });
    if (error) throw new Error(error.message);
    return;
  }

  await db.sql`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, label)
    VALUES (${input.userId}, ${tokenHash}, ${input.expiresAt.toISOString()}, ${input.userAgent ?? null}, ${input.label ?? null})
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

export async function revokeAllRefreshTokensForUser(
  db: Db,
  userId: string,
  exceptToken?: string,
): Promise<number> {
  const exceptHash = exceptToken ? await hashRefreshToken(exceptToken) : null;
  if (db.kind === 'supabase') {
    let query = db.sb
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (exceptHash) query = query.neq('token_hash', exceptHash);
    const { data, error } = await query.select('id');
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  if (exceptHash) {
    const rows = await db.sql`
      UPDATE refresh_tokens SET revoked_at = now()
      WHERE user_id = ${userId}
        AND revoked_at IS NULL
        AND token_hash <> ${exceptHash}
      RETURNING id
    `;
    return rows.length;
  }
  const rows = await db.sql`
    UPDATE refresh_tokens SET revoked_at = now()
    WHERE user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length;
}

export async function listSessionsForUser(
  db: Db,
  userId: string,
  currentToken?: string,
): Promise<DbSession[]> {
  const currentHash = currentToken ? await hashRefreshToken(currentToken) : null;
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('refresh_tokens')
      .select('id, user_id, created_at, expires_at, user_agent, label, token_hash')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row['id']),
      userId: String(row['user_id']),
      createdAt: new Date(String(row['created_at'])).toISOString(),
      expiresAt: new Date(String(row['expires_at'])).toISOString(),
      userAgent: row['user_agent'] ? String(row['user_agent']) : null,
      label: row['label'] ? String(row['label']) : null,
      current: currentHash !== null && String(row['token_hash']) === currentHash,
    }));
  }

  const rows = await db.sql`
    SELECT id, user_id, created_at, expires_at, user_agent, label, token_hash
    FROM refresh_tokens
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: String(row['id']),
    userId: String(row['user_id']),
    createdAt: new Date(String(row['created_at'])).toISOString(),
    expiresAt: new Date(String(row['expires_at'])).toISOString(),
    userAgent: row['user_agent'] ? String(row['user_agent']) : null,
    label: row['label'] ? String(row['label']) : null,
    current: currentHash !== null && String(row['token_hash']) === currentHash,
  }));
}

export async function revokeSessionForUser(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .select('id');
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  const rows = await db.sql`
    UPDATE refresh_tokens SET revoked_at = now()
    WHERE id = ${sessionId} AND user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

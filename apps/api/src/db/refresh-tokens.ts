import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';

export interface DbSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
  label: string | null;
  current: boolean;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export async function storeRefreshToken(
  pool: Pool,
  input: {
    userId: string;
    token: string;
    expiresAt: Date;
    userAgent?: string | null;
    label?: string | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, label)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.userId,
      hashRefreshToken(input.token),
      input.expiresAt.toISOString(),
      input.userAgent ?? null,
      input.label ?? null,
    ],
  );
}

export async function findValidRefreshToken(
  pool: Pool,
  token: string,
): Promise<{ id: string; userId: string } | null> {
  const result = await pool.query(
    `SELECT id, user_id
     FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [hashRefreshToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: String(row['id']), userId: String(row['user_id']) };
}

export async function revokeRefreshToken(pool: Pool, token: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashRefreshToken(token)],
  );
}

export async function revokeRefreshTokenById(pool: Pool, id: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE id = $1 AND revoked_at IS NULL`,
    [id],
  );
}

export async function revokeAllRefreshTokensForUser(
  pool: Pool,
  userId: string,
  exceptToken?: string,
): Promise<number> {
  const result = exceptToken
    ? await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE user_id = $1
           AND revoked_at IS NULL
           AND token_hash <> $2`,
        [userId, hashRefreshToken(exceptToken)],
      )
    : await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
  return result.rowCount ?? 0;
}

export async function listSessionsForUser(
  pool: Pool,
  userId: string,
  currentToken?: string,
): Promise<DbSession[]> {
  const currentHash = currentToken ? hashRefreshToken(currentToken) : null;
  const result = await pool.query(
    `SELECT id, user_id, created_at, expires_at, user_agent, label, token_hash
     FROM refresh_tokens
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map((row) => ({
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
  pool: Pool,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sessionId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

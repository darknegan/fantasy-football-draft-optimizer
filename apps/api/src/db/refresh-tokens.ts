import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export async function storeRefreshToken(
  pool: Pool,
  input: { userId: string; token: string; expiresAt: Date },
): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [input.userId, hashRefreshToken(input.token), input.expiresAt.toISOString()],
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

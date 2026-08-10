import type { Pool } from 'pg';

export interface DbUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}

function mapUser(row: Record<string, unknown>): DbUser {
  return {
    id: String(row['id']),
    email: String(row['email']),
    displayName: String(row['display_name']),
    passwordHash: String(row['password_hash']),
    createdAt: new Date(String(row['created_at'])).toISOString(),
  };
}

export async function createUser(
  pool: Pool,
  input: { email: string; displayName: string; passwordHash: string },
): Promise<DbUser> {
  const result = await pool.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, password_hash, created_at`,
    [input.email.toLowerCase(), input.displayName, input.passwordHash],
  );
  return mapUser(result.rows[0]!);
}

export async function findUserByEmail(pool: Pool, email: string): Promise<DbUser | null> {
  const result = await pool.query(
    `SELECT id, email, display_name, password_hash, created_at
     FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function findUserById(pool: Pool, id: string): Promise<DbUser | null> {
  const result = await pool.query(
    `SELECT id, email, display_name, password_hash, created_at
     FROM users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

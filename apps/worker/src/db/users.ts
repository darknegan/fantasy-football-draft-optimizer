import type { Sql } from './client.js';

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
  sql: Sql,
  input: { email: string; displayName: string; passwordHash: string },
): Promise<DbUser> {
  const rows = await sql`
    INSERT INTO users (email, display_name, password_hash)
    VALUES (${input.email.toLowerCase()}, ${input.displayName}, ${input.passwordHash})
    RETURNING id, email, display_name, password_hash, created_at
  `;
  return mapUser(rows[0]!);
}

export async function findUserByEmail(sql: Sql, email: string): Promise<DbUser | null> {
  const rows = await sql`
    SELECT id, email, display_name, password_hash, created_at
    FROM users WHERE email = ${email.toLowerCase()}
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function findUserById(sql: Sql, id: string): Promise<DbUser | null> {
  const rows = await sql`
    SELECT id, email, display_name, password_hash, created_at
    FROM users WHERE id = ${id}
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

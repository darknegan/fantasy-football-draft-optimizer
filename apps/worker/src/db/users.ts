import type { Db } from './client.js';

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
  db: Db,
  input: { email: string; displayName: string; passwordHash: string },
): Promise<DbUser> {
  const email = input.email.toLowerCase();
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('users')
      .insert({
        email,
        display_name: input.displayName,
        password_hash: input.passwordHash,
      })
      .select('id, email, display_name, password_hash, created_at')
      .single();
    if (error) throw new Error(error.message);
    return mapUser(data as Record<string, unknown>);
  }

  const rows = await db.sql`
    INSERT INTO users (email, display_name, password_hash)
    VALUES (${email}, ${input.displayName}, ${input.passwordHash})
    RETURNING id, email, display_name, password_hash, created_at
  `;
  return mapUser(rows[0]!);
}

export async function findUserByEmail(db: Db, email: string): Promise<DbUser | null> {
  const normalized = email.toLowerCase();
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('users')
      .select('id, email, display_name, password_hash, created_at')
      .eq('email', normalized)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapUser(data as Record<string, unknown>) : null;
  }

  const rows = await db.sql`
    SELECT id, email, display_name, password_hash, created_at
    FROM users WHERE email = ${normalized}
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function findUserById(db: Db, id: string): Promise<DbUser | null> {
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('users')
      .select('id, email, display_name, password_hash, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapUser(data as Record<string, unknown>) : null;
  }

  const rows = await db.sql`
    SELECT id, email, display_name, password_hash, created_at
    FROM users WHERE id = ${id}
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

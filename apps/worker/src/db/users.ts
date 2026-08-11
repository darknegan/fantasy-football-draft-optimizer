import {
  DEFAULT_USER_PREFERENCES,
  mergeUserPreferences,
  normalizeInitialsColor,
  type InitialsColor,
  type UserPreferences,
} from '@draftlab/domain';
import type { Db } from './client.js';

export interface DbUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  timeZone: string;
  initialsColor: InitialsColor;
  passwordChangedAt: string | null;
  preferences: UserPreferences;
  createdAt: string;
}

const SELECT_COLS =
  'id, email, display_name, password_hash, time_zone, initials_color, password_changed_at, preferences, created_at';

function mapUser(row: Record<string, unknown>): DbUser {
  return {
    id: String(row['id']),
    email: String(row['email']),
    displayName: String(row['display_name']),
    passwordHash: String(row['password_hash']),
    timeZone: String(row['time_zone'] ?? 'America/New_York'),
    initialsColor: normalizeInitialsColor(row['initials_color']),
    passwordChangedAt: row['password_changed_at']
      ? new Date(String(row['password_changed_at'])).toISOString()
      : null,
    preferences: mergeUserPreferences(
      (row['preferences'] as Partial<UserPreferences> | null) ?? DEFAULT_USER_PREFERENCES,
    ),
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
      .select(SELECT_COLS)
      .single();
    if (error) throw new Error(error.message);
    return mapUser(data as Record<string, unknown>);
  }

  const rows = await db.sql`
    INSERT INTO users (email, display_name, password_hash)
    VALUES (${email}, ${input.displayName}, ${input.passwordHash})
    RETURNING id, email, display_name, password_hash, time_zone, initials_color,
      password_changed_at, preferences, created_at
  `;
  return mapUser(rows[0]!);
}

export async function findUserByEmail(db: Db, email: string): Promise<DbUser | null> {
  const normalized = email.toLowerCase();
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('users')
      .select(SELECT_COLS)
      .eq('email', normalized)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapUser(data as Record<string, unknown>) : null;
  }

  const rows = await db.sql`
    SELECT id, email, display_name, password_hash, time_zone, initials_color,
      password_changed_at, preferences, created_at
    FROM users WHERE email = ${normalized}
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function findUserById(db: Db, id: string): Promise<DbUser | null> {
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('users')
      .select(SELECT_COLS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapUser(data as Record<string, unknown>) : null;
  }

  const rows = await db.sql`
    SELECT id, email, display_name, password_hash, time_zone, initials_color,
      password_changed_at, preferences, created_at
    FROM users WHERE id = ${id}
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function updateUserProfile(
  db: Db,
  userId: string,
  input: {
    displayName?: string;
    timeZone?: string;
    initialsColor?: InitialsColor;
    preferences?: UserPreferences;
  },
): Promise<DbUser | null> {
  if (db.kind === 'supabase') {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.displayName !== undefined) patch['display_name'] = input.displayName;
    if (input.timeZone !== undefined) patch['time_zone'] = input.timeZone;
    if (input.initialsColor !== undefined) patch['initials_color'] = input.initialsColor;
    if (input.preferences !== undefined) patch['preferences'] = input.preferences;
    const { data, error } = await db.sb
      .from('users')
      .update(patch)
      .eq('id', userId)
      .select(SELECT_COLS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapUser(data as Record<string, unknown>) : null;
  }

  const rows = await db.sql`
    UPDATE users SET
      display_name = COALESCE(${input.displayName ?? null}, display_name),
      time_zone = COALESCE(${input.timeZone ?? null}, time_zone),
      initials_color = COALESCE(${input.initialsColor ?? null}, initials_color),
      preferences = COALESCE(${input.preferences ? JSON.stringify(input.preferences) : null}::jsonb, preferences),
      updated_at = now()
    WHERE id = ${userId}
    RETURNING id, email, display_name, password_hash, time_zone, initials_color,
      password_changed_at, preferences, created_at
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function updateUserPassword(
  db: Db,
  userId: string,
  passwordHash: string,
): Promise<void> {
  if (db.kind === 'supabase') {
    const { error } = await db.sb
      .from('users')
      .update({
        password_hash: passwordHash,
        password_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) throw new Error(error.message);
    return;
  }

  await db.sql`
    UPDATE users
    SET password_hash = ${passwordHash}, password_changed_at = now(), updated_at = now()
    WHERE id = ${userId}
  `;
}

export async function deleteUser(db: Db, userId: string): Promise<void> {
  if (db.kind === 'supabase') {
    const { error } = await db.sb.from('users').delete().eq('id', userId);
    if (error) throw new Error(error.message);
    return;
  }
  await db.sql`DELETE FROM users WHERE id = ${userId}`;
}

export async function countLeaguesForUser(db: Db, userId: string): Promise<number> {
  if (db.kind === 'supabase') {
    const { count, error } = await db.sb
      .from('leagues')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }
  const rows = await db.sql`SELECT count(*)::int AS n FROM leagues WHERE user_id = ${userId}`;
  return Number(rows[0]?.['n'] ?? 0);
}

import {
  DEFAULT_USER_PREFERENCES,
  mergeUserPreferences,
  normalizeInitialsColor,
  type InitialsColor,
  type UserPreferences,
} from '@draftlab/domain';
import type { Pool } from 'pg';

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

const USER_COLUMNS = `id, email, display_name, password_hash, time_zone, initials_color,
  password_changed_at, preferences, created_at`;

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
  pool: Pool,
  input: { email: string; displayName: string; passwordHash: string },
): Promise<DbUser> {
  const result = await pool.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${USER_COLUMNS}`,
    [input.email.toLowerCase(), input.displayName, input.passwordHash],
  );
  return mapUser(result.rows[0]!);
}

export async function findUserByEmail(pool: Pool, email: string): Promise<DbUser | null> {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS}
     FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function findUserById(pool: Pool, id: string): Promise<DbUser | null> {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS}
     FROM users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function updateUserProfile(
  pool: Pool,
  userId: string,
  input: {
    displayName?: string;
    timeZone?: string;
    initialsColor?: InitialsColor;
    preferences?: UserPreferences;
  },
): Promise<DbUser | null> {
  const result = await pool.query(
    `UPDATE users SET
       display_name = COALESCE($2, display_name),
       time_zone = COALESCE($3, time_zone),
       initials_color = COALESCE($4, initials_color),
       preferences = COALESCE($5::jsonb, preferences),
       updated_at = now()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [
      userId,
      input.displayName ?? null,
      input.timeZone ?? null,
      input.initialsColor ?? null,
      input.preferences ? JSON.stringify(input.preferences) : null,
    ],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function updateUserPassword(
  pool: Pool,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await pool.query(
    `UPDATE users
     SET password_hash = $2, password_changed_at = now(), updated_at = now()
     WHERE id = $1`,
    [userId, passwordHash],
  );
}

export async function deleteUser(pool: Pool, userId: string): Promise<void> {
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

export async function countLeaguesForUser(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query(`SELECT count(*)::int AS n FROM leagues WHERE user_id = $1`, [
    userId,
  ]);
  return Number(result.rows[0]?.['n'] ?? 0);
}

export async function listUserIds(pool: Pool): Promise<string[]> {
  const result = await pool.query(`SELECT id FROM users`);
  return result.rows.map((row) => String(row['id']));
}

import {
  DEFAULT_USER_PREFERENCES,
  mergeUserPreferences,
} from '@draftlab/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../db/pool.js';
import {
  createUser,
  findUserById,
  updateUserPassword,
  updateUserProfile,
} from '../../db/users.js';
import {
  generateRefreshToken,
  listSessionsForUser,
  revokeAllRefreshTokensForUser,
  revokeSessionForUser,
  storeRefreshToken,
} from '../../db/refresh-tokens.js';
import { hashPassword, verifyPassword } from '../password.js';
import { publicUser, sessionLabelFromUserAgent } from '../session.js';
import { refreshExpiresAt } from '../tokens.js';

const hasDb = !!process.env['DATABASE_URL'];

describe.skipIf(!hasDb)('user profile persistence', () => {
  const suffix = Date.now().toString(36);
  let pool: ReturnType<typeof getPool>;
  let userId = '';

  beforeAll(async () => {
    pool = getPool();
    await pool.query('SELECT 1');
    const user = await createUser(pool, {
      email: `profile-${suffix}@example.com`,
      displayName: 'Profile User',
      passwordHash: await hashPassword('password123'),
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%${suffix}@example.com`]);
    await closePool();
  });

  it('stores profile fields and merges preferences', async () => {
    const prefs = mergeUserPreferences({
      boardDensity: 'compact',
      notifications: {
        draftStarting: true,
        draftLeadTimes: ['24h'],
        pickUp: true,
        positionRun: true,
      },
    });
    const updated = await updateUserProfile(pool!, userId, {
      displayName: 'Jordan Vega',
      timeZone: 'America/Chicago',
      initialsColor: 'pos-wr',
      preferences: prefs,
    });
    expect(updated?.displayName).toBe('Jordan Vega');
    expect(updated?.timeZone).toBe('America/Chicago');
    expect(updated?.initialsColor).toBe('pos-wr');
    expect(updated?.preferences.boardDensity).toBe('compact');
    expect(updated?.preferences.colorBlindShapes).toBe(true);
    expect(updated?.preferences.notifications.draftLeadTimes).toEqual(['24h']);

    const publicShape = publicUser(updated!);
    expect(publicShape.preferences.landingScreen).toBe(DEFAULT_USER_PREFERENCES.landingScreen);
    expect(publicShape).not.toHaveProperty('passwordHash');
  });

  it('updates password hashes', async () => {
    await updateUserPassword(pool!, userId, await hashPassword('new-password-99'));
    const user = await findUserById(pool!, userId);
    expect(await verifyPassword(user!.passwordHash, 'new-password-99')).toBe(true);
    expect(user?.passwordChangedAt).toBeTruthy();
  });

  it('lists and revokes sessions', async () => {
    const tokenA = generateRefreshToken();
    const tokenB = generateRefreshToken();
    await storeRefreshToken(pool!, {
      userId,
      token: tokenA,
      expiresAt: refreshExpiresAt(),
      userAgent: 'Mozilla/5.0 (Macintosh) Chrome/124.0.0.0 Safari/537.36',
      label: sessionLabelFromUserAgent(
        'Mozilla/5.0 (Macintosh) Chrome/124.0.0.0 Safari/537.36',
      ),
    });
    await storeRefreshToken(pool!, {
      userId,
      token: tokenB,
      expiresAt: refreshExpiresAt(),
      label: 'Safari · iPhone',
    });

    const sessions = await listSessionsForUser(pool!, userId, tokenA);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const current = sessions.find((s) => s.current);
    expect(current?.label).toContain('Chrome');

    const other = sessions.find((s) => !s.current);
    expect(other).toBeTruthy();
    expect(await revokeSessionForUser(pool!, userId, other!.id)).toBe(true);
    expect(await revokeAllRefreshTokensForUser(pool!, userId, tokenA)).toBeGreaterThanOrEqual(0);
    const remaining = await listSessionsForUser(pool!, userId, tokenA);
    expect(remaining.every((s) => s.current || s.id === current?.id)).toBe(true);
  });
});

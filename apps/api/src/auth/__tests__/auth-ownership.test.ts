import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManualLeague, DEFAULT_ROSTER_12, SCORING_PRESETS } from '@draftlab/integrations';
import { closePool, getPool } from '../../db/pool.js';
import { createUser, findUserByEmail } from '../../db/users.js';
import { upsertLeagueRow, getLeagueForUser, listLeaguesForUser } from '../../db/leagues.js';
import {
  findValidRefreshToken,
  generateRefreshToken,
  revokeRefreshToken,
  storeRefreshToken,
} from '../../db/refresh-tokens.js';
import { hashPassword, verifyPassword } from '../password.js';
import { refreshExpiresAt, signAccessToken, verifyAccessToken } from '../tokens.js';
import { AppStore } from '../../services/store.js';
import { SEED_PLAYERS } from '../../data/seed-players.js';

const hasDb = !!process.env['DATABASE_URL'];
const hasSecrets =
  !!process.env['JWT_ACCESS_SECRET'] && !!process.env['JWT_REFRESH_SECRET'];

describe.skipIf(!hasDb || !hasSecrets)('auth + ownership', () => {
  const pool = getPool();
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%${suffix}@example.com`]);
    await closePool();
  });

  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('password123');
    expect(await verifyPassword(hash, 'password123')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('issues and verifies access tokens', async () => {
    const token = await signAccessToken({
      sub: '00000000-0000-4000-8000-000000000001',
      email: 'a@example.com',
      displayName: 'A',
    });
    const claims = await verifyAccessToken(token);
    expect(claims.email).toBe('a@example.com');
  });

  it('rotates refresh tokens', async () => {
    const email = `rotate-${suffix}@example.com`;
    const user = await createUser(pool, {
      email,
      displayName: 'Rotate',
      passwordHash: await hashPassword('password123'),
    });
    const token = generateRefreshToken();
    await storeRefreshToken(pool, {
      userId: user.id,
      token,
      expiresAt: refreshExpiresAt(),
    });
    const found = await findValidRefreshToken(pool, token);
    expect(found?.userId).toBe(user.id);
    await revokeRefreshToken(pool, token);
    expect(await findValidRefreshToken(pool, token)).toBeNull();
  });

  it('scopes leagues per user and isolates sleeper external ids', async () => {
    const a = await createUser(pool, {
      email: `a-${suffix}@example.com`,
      displayName: 'A',
      passwordHash: await hashPassword('password123'),
    });
    const b = await createUser(pool, {
      email: `b-${suffix}@example.com`,
      displayName: 'B',
      passwordHash: await hashPassword('password123'),
    });

    const leagueA = createManualLeague({
      userId: a.id,
      name: 'A League',
      teamCount: 12,
      season: 2025,
      scoring: SCORING_PRESETS[0]!,
      roster: DEFAULT_ROSTER_12,
    });
    leagueA.platform = 'sleeper';
    leagueA.externalId = `ext-${suffix}`;
    const savedA = await upsertLeagueRow(pool, leagueA);

    const leagueB = createManualLeague({
      userId: b.id,
      name: 'B League',
      teamCount: 10,
      season: 2025,
      scoring: SCORING_PRESETS[0]!,
      roster: DEFAULT_ROSTER_12,
    });
    leagueB.platform = 'sleeper';
    leagueB.externalId = `ext-${suffix}`;
    const savedB = await upsertLeagueRow(pool, leagueB);

    expect(savedA.id).not.toBe(savedB.id);
    expect((await listLeaguesForUser(pool, a.id)).map((l) => l.id)).toEqual([savedA.id]);
    expect(await getLeagueForUser(pool, a.id, savedB.id)).toBeNull();
    expect(await getLeagueForUser(pool, b.id, savedB.id)).not.toBeNull();

    const store = new AppStore(SEED_PLAYERS);
    store.hydrateLeagues([savedA, savedB]);
    expect(store.assertOwns(a.id, savedA.id)?.name).toBe('A League');
    expect(store.assertOwns(a.id, savedB.id)).toBeNull();
  });

  it('keeps calibration apply per-league', () => {
    const store = new AppStore(SEED_PLAYERS);
    const demos = store.seedDemoLeagues('00000000-0000-4000-8000-000000000099');
    store.formats.outcomes.set(demos.demo.id, store.calibrationSummary(demos.demo.id)?.outcomes ?? []);
    const beforeOther = store.formats.getActiveWeights(demos.dynasty.id);
    store.proposeLeagueCalibration(demos.demo.id);
    store.applyLeagueCalibration(demos.demo.id);
    const afterDemo = store.formats.getActiveWeights(demos.demo.id);
    const afterOther = store.formats.getActiveWeights(demos.dynasty.id);
    expect(afterOther).toEqual(beforeOther);
    // Applied league may equal defaults if proposal is mild, but maps are independent.
    expect(store.formats.activeWeightsByLeague.has(demos.demo.id)).toBe(true);
    expect(afterDemo).toBeTruthy();
  });

  it('finds users by email case-insensitively', async () => {
    const email = `Case-${suffix}@example.com`;
    await createUser(pool, {
      email,
      displayName: 'Case',
      passwordHash: await hashPassword('password123'),
    });
    const found = await findUserByEmail(pool, email.toUpperCase());
    expect(found?.displayName).toBe('Case');
  });
});

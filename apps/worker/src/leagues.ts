import type { League } from '@draftlab/domain';
import type { AppStore } from '../../api/src/services/store.js';
import { createDb, endDb, type Db } from './db/client.js';
import { getLeagueForUser, listLeaguesForUser, persistLeagueFormatState, upsertLeagueRow } from './db/leagues.js';
import { ensureWfflForUser } from '../../api/src/services/ensure-wffl.js';

type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

export async function withDb<T>(
  env: Env,
  ctx: WaitUntilCtx,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const db = createDb(env);
  try {
    return await fn(db);
  } finally {
    await endDb(db, ctx);
  }
}

/** @deprecated alias */
export const withSql = withDb;

export async function ownedLeague(
  store: AppStore,
  db: Db,
  userId: string,
  leagueId: string,
): Promise<League | null> {
  const memory = store.assertOwns(userId, leagueId);
  if (memory) return memory;
  const fromDb = await getLeagueForUser(db, userId, leagueId);
  if (!fromDb) return null;
  store.hydrateLeagues([fromDb]);
  return fromDb;
}

export async function loadUserLeagues(store: AppStore, db: Db, userId: string): Promise<League[]> {
  await ensureWfflForUser(store, userId, {
    list: () => listLeaguesForUser(db, userId),
    upsert: (league) => upsertLeagueRow(db, league),
    persistFormat: async (leagueId, league) => {
      await persistLeagueFormatState(db, userId, leagueId, league.formatState);
    },
  });
  return store.listLeagues(userId);
}

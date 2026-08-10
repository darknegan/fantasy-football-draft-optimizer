import type { League } from '@draftlab/domain';
import type { AppStore } from '../../api/src/services/store.js';
import { createDb, endDb, type Db } from './db/client.js';
import { getLeagueForUser, listLeaguesForUser } from './db/leagues.js';

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
  const fromDb = await listLeaguesForUser(db, userId);
  store.hydrateLeagues(fromDb);
  return store.listLeagues(userId);
}

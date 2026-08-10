import type { League } from '@draftlab/domain';
import type { AppStore } from '../../api/src/services/store.js';
import { createSql, endSql, type Sql } from './db/client.js';
import { getLeagueForUser, listLeaguesForUser } from './db/leagues.js';

type WaitUntilCtx = { waitUntil(promise: Promise<unknown>): void };

export async function withSql<T>(
  env: Env,
  ctx: WaitUntilCtx,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  const sql = createSql(env);
  try {
    return await fn(sql);
  } finally {
    await endSql(sql, ctx);
  }
}

export async function ownedLeague(
  store: AppStore,
  sql: Sql,
  userId: string,
  leagueId: string,
): Promise<League | null> {
  const memory = store.assertOwns(userId, leagueId);
  if (memory) return memory;
  const fromDb = await getLeagueForUser(sql, userId, leagueId);
  if (!fromDb) return null;
  store.hydrateLeagues([fromDb]);
  return fromDb;
}

export async function loadUserLeagues(store: AppStore, sql: Sql, userId: string): Promise<League[]> {
  const fromDb = await listLeaguesForUser(sql, userId);
  store.hydrateLeagues(fromDb);
  return store.listLeagues(userId);
}

import type { League } from '@draftlab/domain';
import { WFFL_EXTERNAL_ID } from '../data/wffl-league.js';
import type { AppStore } from './store.js';

export async function ensureWfflForUser(
  store: AppStore,
  userId: string,
  deps: {
    list: () => Promise<League[]>;
    upsert: (league: League) => Promise<League>;
    persistFormat: (leagueId: string, league: League) => Promise<void>;
  },
): Promise<League> {
  store.hydrateLeagues(await deps.list());
  const existing = store.listLeagues(userId).find((l) => l.externalId === WFFL_EXTERNAL_ID);
  if (existing) {
    store.applyWfflTemplateIfEmpty(existing.id);
    const current = store.getLeague(existing.id) ?? existing;
    await deps.persistFormat(current.id, current);
    return current;
  }
  const seeded = store.seedWfflLeague(userId);
  const saved = await deps.upsert(seeded);
  if (saved.id !== seeded.id) {
    store.removeLeague(seeded.id);
    store.hydrateLeagues([saved]);
  }
  const live = store.getLeague(saved.id) ?? saved;
  await deps.persistFormat(live.id, live);
  return live;
}

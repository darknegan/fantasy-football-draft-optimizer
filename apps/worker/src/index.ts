import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuctionValuesArtifact } from '@draftlab/auction-engine';
import type { DraftType, LeagueType, RosterShape, StrategyId } from '@draftlab/domain';
import {
  activateBenchmarkArtifact,
  type BenchmarksArtifact,
} from '@draftlab/evaluation-engine';
import {
  createManualLeague,
  mapSleeperLeague,
  resolveDraftSlot,
  rosterPresetForScoring,
  scoringConfirmation,
  SCORING_PRESETS,
  sharedSleeperLimiter,
  sharedSleeperStatsClient,
  SleeperApiError,
  SleeperClient,
  withHeadshot,
  type ScoringVariant,
  type SeasonType,
} from '@draftlab/integrations';
import { getDraftSlotInfo } from '@draftlab/strategy-engine';
import playerFactors from '../../api/data/player_factors.json' with { type: 'json' };
import benchmarksBootstrap from '../../api/data/benchmarks.json' with { type: 'json' };
import auction1qbFullPpr from '../../api/data/auction/1qb-full-ppr.json' with { type: 'json' };
import auction1qbHalfPpr from '../../api/data/auction/1qb-half-ppr.json' with { type: 'json' };
import auctionSuperflexFullPpr from '../../api/data/auction/superflex-full-ppr.json' with { type: 'json' };
import { createR2ArtifactCache } from '../../api/src/data/artifact-cache.js';
import {
  artifactMetaFromLoaded,
  bootstrapArtifactMeta,
  type ArtifactsHealthMeta,
} from '../../api/src/data/artifact-meta.js';
import { loadArtifacts } from '../../api/src/data/artifact-provider.js';
import { loadAuctionBoards } from '../../api/src/data/auction-artifact-provider.js';
import {
  seedPlayersFromArtifact,
  type PlayerFactorsArtifact,
} from '../../api/src/data/load-artifact.js';
import { AppStore } from '../../api/src/services/store.js';
import { dbUnavailable, requireAccessJwt, type WorkerUser } from './auth.js';
import { dbHealthCheck } from './db/client.js';
import { deleteLeagueRow, persistLeagueFormatState, updateLeagueRow, upsertLeagueRow } from './db/leagues.js';
import { loadUserLeagues, ownedLeague, withDb } from './leagues.js';
import { authRoutes } from './routes/auth.js';

const auctionBootstrap = {
  '1qb-full-ppr': auction1qbFullPpr as unknown as AuctionValuesArtifact,
  '1qb-half-ppr': auction1qbHalfPpr as unknown as AuctionValuesArtifact,
  'superflex-full-ppr': auctionSuperflexFullPpr as unknown as AuctionValuesArtifact,
};

function storeFromFactors(
  factors: PlayerFactorsArtifact,
  label: string,
  auctionBoards: AuctionValuesArtifact[] = Object.values(auctionBootstrap),
): AppStore {
  const { players, skipped } = seedPlayersFromArtifact(factors);
  if (players.length === 0) {
    throw new Error(`[worker] loaded 0 players from ${label}`);
  }
  if (skipped.length) {
    console.warn(`[worker] ${skipped.length} artifact player(s) skipped (incomplete bio)`);
  }
  console.log(`[worker] loaded ${players.length} players from ${label}`);
  return new AppStore(players, { auctionBoards });
}

// Sync bootstrap so the isolate always has a draftable board before R2 loads.
activateBenchmarkArtifact(benchmarksBootstrap as unknown as BenchmarksArtifact);
let store = storeFromFactors(playerFactors as unknown as PlayerFactorsArtifact, 'bundled bootstrap');
let artifactMeta: ArtifactsHealthMeta = bootstrapArtifactMeta(
  playerFactors as { generated_at?: string },
  benchmarksBootstrap as { generated_at?: string },
);

let storeInit: Promise<void> | null = null;

async function refreshStoreFromArtifacts(env: Env): Promise<void> {
  const cache = createR2ArtifactCache(env.ARTIFACTS);
  const loaded = await loadArtifacts({
    cache,
    bootstrapFactors: playerFactors as unknown as PlayerFactorsArtifact,
    bootstrapBenchmarks: benchmarksBootstrap as unknown as BenchmarksArtifact,
  });
  const auctionLoaded = await loadAuctionBoards({
    cache,
    bootstrap: auctionBootstrap,
  });
  activateBenchmarkArtifact(loaded.benchmarks);
  store = storeFromFactors(
    loaded.factors,
    `provider (factors=${loaded.factorsSource}, benchmarks=${loaded.benchmarksSource}, auction=${auctionLoaded.boards.length})`,
    auctionLoaded.boards,
  );
  artifactMeta = artifactMetaFromLoaded(loaded);
}

function ensureStore(env: Env): Promise<void> {
  if (!storeInit) {
    storeInit = refreshStoreFromArtifacts(env).catch((err) => {
      console.warn(
        `[worker] artifact refresh failed; keeping bootstrap store: ${
          err instanceof Error ? err.message : err
        }`,
      );
      // Allow a later request to retry.
      storeInit = null;
    });
  }
  return storeInit ?? Promise.resolve();
}

const app = new Hono<{ Bindings: Env; Variables: { user: WorkerUser } }>();

app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    credentials: true,
  }),
);

app.route('/', authRoutes);

app.use('/api/leagues/*', requireAccessJwt);
app.use('/api/leagues', requireAccessJwt);

app.use('*', async (c, next) => {
  await ensureStore(c.env);
  await next();
});

app.get('/api/health', async (c) => {
  let deployedAt = await c.env.DRAFTLAB_KV.get('deployedAt');
  if (!deployedAt) {
    deployedAt = new Date().toISOString();
    await c.env.DRAFTLAB_KV.put('deployedAt', deployedAt);
  }

  let database: 'up' | 'down' | 'unconfigured' = 'unconfigured';
  let databaseError: string | undefined;
  const hasDb =
    !!c.env.SUPABASE_SERVICE_ROLE_KEY || !!c.env.HYPERDRIVE || !!c.env.DATABASE_URL;
  if (hasDb) {
    try {
      await withDb(c.env, c.executionCtx, async (db) => {
        await dbHealthCheck(db);
      });
      database = 'up';
    } catch (err) {
      database = 'down';
      databaseError = err instanceof Error ? err.message : String(err);
    }
  }

  return c.json({
    ok: true,
    service: c.env.SERVICE_NAME,
    runtime: 'cloudflare-workers',
    deployedAt,
    artifacts: artifactMeta,
    database,
    ...(databaseError ? { databaseError } : {}),
    dbBinding: c.env.SUPABASE_SERVICE_ROLE_KEY
      ? 'supabase_http'
      : c.env.HYPERDRIVE
        ? 'hyperdrive'
        : c.env.DATABASE_URL
          ? 'database_url'
          : 'none',
  });
});

app.get('/api/players', (c) =>
  c.json(
    store.listPlayers().map((player) => ({
      player: withHeadshot(player),
      evaluation: store.getEvaluation(player.id),
    })),
  ),
);

app.get('/api/players/:id', (c) => {
  const player = store.getPlayer(c.req.param('id'));
  if (!player) return c.json({ error: 'Player not found' }, 404);
  return c.json({ player: withHeadshot(player), evaluation: store.getEvaluation(player.id) });
});

app.get('/api/players/:id/game-log', async (c) => {
  const player = store.getPlayer(c.req.param('id'));
  if (!player) return c.json({ error: 'Player not found' }, 404);
  const sleeperId = player.externalIds?.sleeper;
  if (!sleeperId) return c.json({ error: 'Player has no Sleeper id' }, 404);

  const q = c.req.query();
  let season: number;
  let seasonType: SeasonType =
    q['season_type'] === 'post' || q['season_type'] === 'pre' || q['season_type'] === 'off'
      ? q['season_type']
      : 'regular';

  if (q['season']) {
    season = Number(q['season']);
    if (!Number.isFinite(season) || season < 2000 || season > 2100) {
      return c.json({ error: 'Invalid season' }, 400);
    }
  } else {
    try {
      const defaults = await sharedSleeperStatsClient.defaultGameLogSeason();
      season = defaults.season;
      if (!q['season_type']) seasonType = defaults.seasonType;
    } catch (err) {
      const status: ContentfulStatusCode =
        err instanceof SleeperApiError && err.status === 429 ? 503 : 502;
      return c.json(
        {
          error: 'Failed to resolve NFL season from Sleeper',
          detail: err instanceof Error ? err.message : String(err),
        },
        status,
      );
    }
  }

  let scoring: ScoringVariant = 'ppr';
  if (q['scoring'] === 'std' || q['scoring'] === 'standard') {
    scoring = 'std';
  } else if (q['scoring'] === 'half_ppr' || q['scoring'] === 'ppr') {
    scoring = q['scoring'];
  } else if (q['leagueId']) {
    const league = store.getLeague(q['leagueId']);
    const variant = league?.scoring?.variant;
    if (variant === 'standard') scoring = 'std';
    else if (variant === 'half_ppr' || variant === 'ppr') scoring = variant;
  }

  try {
    const gameLog = await sharedSleeperStatsClient.getPlayerGameLog({
      sleeperPlayerId: sleeperId,
      season,
      seasonType,
      scoring,
    });
    const seasons: number[] = [];
    for (let y = season; y >= season - 4 && y >= 2015; y -= 1) seasons.push(y);
    return c.json({
      playerId: player.id,
      sleeperId,
      headshotUrl: withHeadshot(player).headshotUrl,
      availableSeasons: seasons,
      gameLog,
      scoring,
    });
  } catch (err) {
    const status: ContentfulStatusCode =
      err instanceof SleeperApiError && err.status === 429 ? 503 : 502;
    return c.json(
      {
        error: 'Failed to load game log from Sleeper',
        detail: err instanceof Error ? err.message : String(err),
      },
      status,
    );
  }
});

app.get('/api/leagues', async (c) => {
  const user = c.get('user');
  try {
    const leagues = await withDb(c.env, c.executionCtx, (db) =>
      loadUserLeagues(store, db, user.sub),
    );
    return c.json(
      leagues.map((league) => ({
        ...league,
        scoringSummary: scoringConfirmation(league),
      })),
    );
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.get('/api/sleeper/limiter', (c) => c.json(sharedSleeperLimiter.snapshot()));

app.get('/api/leagues/:id', async (c) => {
  const user = c.get('user');
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    return c.json({ ...league, scoringSummary: scoringConfirmation(league) });
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.get('/api/scoring-presets', (c) => c.json(SCORING_PRESETS));

app.post('/api/leagues/manual', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    name: string;
    teamCount: number;
    season?: number;
    draftSlot?: number;
    strategyId?: StrategyId;
    scoringPresetId?: string;
    draftType?: DraftType;
    type?: LeagueType;
    roster?: Partial<RosterShape>;
    confirmSummary?: boolean;
  }>();

  const scoring =
    SCORING_PRESETS.find((p) => p.id === body.scoringPresetId) ?? SCORING_PRESETS[0]!;
  const baseRoster = rosterPresetForScoring(body.scoringPresetId);
  const roster: RosterShape = {
    ...baseRoster,
    ...body.roster,
    totalStarters: 0,
  };
  roster.totalStarters =
    roster.qb + roster.rb + roster.wr + roster.te + roster.flex + roster.superflex;

  const league = createManualLeague({
    userId: user.sub,
    name: body.name,
    teamCount: body.teamCount,
    season: body.season ?? 2025,
    scoring,
    roster,
    draftSlot: body.draftSlot,
    strategyId: body.strategyId ?? 'balanced',
    draftType: body.draftType,
    type: body.type,
  });

  try {
    const saved = await withDb(c.env, c.executionCtx, async (db) => {
      const persisted = await upsertLeagueRow(db, league);
      const inMemory = store.upsertLeague(persisted);
      store.recalculateForLeague(inMemory.id);
      return inMemory;
    });
    const summary = scoringConfirmation(saved);
    if (!body.confirmSummary) {
      return c.json(
        {
          league: saved,
          scoringSummary: summary,
          requiresConfirmation: true,
          message: 'Confirm scoring summary before drafting.',
        },
        201,
      );
    }
    return c.json({ league: saved, scoringSummary: summary, requiresConfirmation: false });
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/sleeper/connect', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ username: string; season?: number }>();
  const client = new SleeperClient();
  try {
    const sleeperUser = await client.getUser(body.username);
    const season = body.season ?? new Date().getFullYear();
    const leagues = await client.getUserLeagues(sleeperUser.user_id, season);
    const mapped = await withDb(c.env, c.executionCtx, async (db) => {
      const out = [];
      for (const l of leagues) {
        let draft = null;
        try {
          const drafts = await client.getLeagueDrafts(l.league_id);
          draft = drafts[0] ?? null;
        } catch {
          draft = null;
        }
        const league = mapSleeperLeague(l, { userId: user.sub, draft });
        league.sleeperUserId = sleeperUser.user_id;
        if (draft && sleeperUser.user_id) {
          league.draftSlot = resolveDraftSlot(draft, sleeperUser.user_id) ?? league.draftSlot;
        }
        const persisted = await upsertLeagueRow(db, league);
        const saved = store.upsertLeague(persisted);
        store.recalculateForLeague(saved.id);
        out.push({
          ...saved,
          scoringSummary: scoringConfirmation(saved),
        });
      }
      return out;
    });
    return c.json({ user: sleeperUser, leagues: mapped, limiter: client.limiterSnapshot() });
  } catch (err) {
    return c.json(
      {
        error: 'Failed to reach Sleeper or database',
        detail: err instanceof Error ? err.message : String(err),
        limiter: sharedSleeperLimiter.snapshot(),
      },
      502,
    );
  }
});

app.post('/api/leagues/:id/recalculate', async (c) => {
  const user = c.get('user');
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const result = store.recalculateForLeague(league.id);
    if (!result) return c.json({ error: 'League not found' }, 404);
    return c.json(result);
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.patch('/api/leagues/:id', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<
    Partial<{ strategyId: StrategyId; draftSlot: number; sleeperDraftId: string; name: string }>
  >();
  try {
    const saved = await withDb(c.env, c.executionCtx, async (db) => {
      if (!(await ownedLeague(store, db, user.sub, c.req.param('id')))) return null;
      const persisted = await updateLeagueRow(db, user.sub, c.req.param('id'), body);
      if (!persisted) return null;
      return store.updateLeague(c.req.param('id'), persisted);
    });
    if (!saved) return c.json({ error: 'League not found' }, 404);
    return c.json({ ...saved, scoringSummary: scoringConfirmation(saved) });
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/:id/draft/picks', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    pickNumber: number;
    round: number;
    slot: number;
    playerId: string;
    rosterId?: string;
  }>();
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'Draft not found' }, 404);
    const draft = store.getDraft(league.id);
    if (!draft) return c.json({ error: 'Draft not found' }, 404);
    const updated = store.applyPick(league.id, {
      pickNumber: body.pickNumber,
      round: body.round,
      slot: body.slot,
      playerId: body.playerId,
      rosterId: body.rosterId ?? draft.userRosterId,
      source: 'manual',
    });
    return c.json({
      draft: updated,
      board: store.getBoard(league.id),
      adherence: store.adherence(league.id),
    });
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/:id/draft/start-polling', async (c) => {
  const user = c.get('user');
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league?.sleeperDraftId) {
      return c.json({ error: 'League has no Sleeper draft id — use manual picks' }, 400);
    }
    store.patchDraft(league.id, { syncMode: 'polling', syncBanner: null });
    return c.json(store.getDraft(league.id));
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/:id/draft/manual-mode', async (c) => {
  const user = c.get('user');
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'Draft not found' }, 404);
    const draft = store.patchDraft(league.id, {
      syncMode: 'manual',
      syncBanner: 'Manual pick entry — Sleeper polling paused.',
    });
    if (!draft) return c.json({ error: 'Draft not found' }, 404);
    return c.json(draft);
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/:id/draft/reset', async (c) => {
  const user = c.get('user');
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const draft = store.getDraft(league.id);
    if (!draft) return c.json({ error: 'Draft not found' }, 404);
    if (league.platform === 'sleeper' && draft.syncMode === 'polling') {
      return c.json(
        { error: 'Cannot reset a live Sleeper draft — switch to manual mode first.' },
        400,
      );
    }
    const reset = store.resetDraft(league.id);
    if (!reset) return c.json({ error: 'Draft not found' }, 404);
    return c.json({
      draft: reset,
      board: store.getBoard(league.id),
      adherence: store.adherence(league.id),
    });
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/:id/sleeper/resync', async (c) => {
  const user = c.get('user');
  try {
    const existing = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!existing) return c.json({ error: 'League not found' }, 404);
    if (existing.platform !== 'sleeper' || !existing.externalId) {
      return c.json({ error: 'League is not linked to Sleeper' }, 400);
    }
    const client = new SleeperClient();
    const sleeperLeague = await client.getLeague(existing.externalId);
    let draft = null;
    try {
      const drafts = await client.getLeagueDrafts(existing.externalId);
      draft = drafts[0] ?? null;
    } catch {
      draft = null;
    }
    const mapped = mapSleeperLeague(sleeperLeague, {
      userId: user.sub,
      draft,
      draftSlot: existing.draftSlot,
    });
    mapped.id = existing.id;
    mapped.sleeperUserId = existing.sleeperUserId ?? mapped.sleeperUserId;
    mapped.strategyId = existing.strategyId ?? mapped.strategyId;
    if (draft && mapped.sleeperUserId) {
      mapped.draftSlot = resolveDraftSlot(draft, mapped.sleeperUserId) ?? mapped.draftSlot;
    }
    const saved = await withDb(c.env, c.executionCtx, async (db) => {
      const persisted = await upsertLeagueRow(db, mapped);
      const next = store.upsertLeague(persisted);
      store.recalculateForLeague(next.id);
      return next;
    });
    return c.json({ ...saved, scoringSummary: scoringConfirmation(saved) });
  } catch (err) {
    const status: ContentfulStatusCode =
      err instanceof SleeperApiError && err.status === 429 ? 503 : 502;
    return c.json(
      {
        error: 'Failed to reach Sleeper',
        detail: err instanceof Error ? err.message : String(err),
      },
      status,
    );
  }
});

app.delete('/api/leagues/:id', async (c) => {
  const user = c.get('user');
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const deleted = await withDb(c.env, c.executionCtx, (db) =>
      deleteLeagueRow(db, user.sub, league.id),
    );
    if (!deleted) return c.json({ error: 'League not found' }, 404);
    store.removeLeague(league.id);
    return c.json({ ok: true });
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/:id/flags', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ playerId: string; kind: 'target' | 'avoid'; value?: boolean }>();
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    store.setFlag(league.id, body.playerId, body.kind, body.value ?? true);
    return c.json({ ok: true, ...store.getFlags(league.id) });
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/:id/dynasty/mode', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ mode?: string }>();
  if (!body.mode) return c.json({ error: 'mode required' }, 400);
  try {
    const overview = await withDb(c.env, c.executionCtx, async (db) => {
      const league = await ownedLeague(store, db, user.sub, c.req.param('id'));
      if (!league) return null;
      await updateLeagueRow(db, user.sub, league.id, {
        dynastyMode: body.mode as never,
        type: 'dynasty',
      });
      store.setDynastyMode(league.id, body.mode as never);
      return store.dynastyOverview(league.id);
    });
    if (!overview) return c.json({ error: 'League not found' }, 404);
    return c.json(overview);
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/:id/auction/bid', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    playerId: string;
    amount: number;
    rosterId?: string;
    contractYears?: number;
  }>();
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const result = store.placeAuctionBid(league.id, body);
    if (!result) return c.json({ error: 'League not found' }, 404);
    if ('error' in result) return c.json({ error: result.error }, 400);
    const snap = store.snapshotFormatState(league.id);
    if (snap) {
      await withDb(c.env, c.executionCtx, (db) =>
        persistLeagueFormatState(db, user.sub, league.id, snap),
      );
    }
    return c.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'Bid failed', detail }, 500);
  }
});

app.patch('/api/leagues/:id/auction/teams/:rosterId', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name?: string }>();
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const result = store.renameAuctionTeam(league.id, c.req.param('rosterId'), body.name ?? '');
    if (!result) return c.json({ error: 'League not found' }, 404);
    if ('error' in result) return c.json({ error: result.error }, 400);
    const snap = store.snapshotFormatState(league.id);
    if (snap) {
      await withDb(c.env, c.executionCtx, (db) =>
        persistLeagueFormatState(db, user.sub, league.id, snap),
      );
    }
    return c.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'Could not rename team', detail }, 500);
  }
});

app.post('/api/leagues/:id/auction/claim-team', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ rosterId?: string }>();
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    if (!body.rosterId) return c.json({ error: 'rosterId required' }, 400);
    const result = store.claimAuctionTeam(league.id, body.rosterId);
    if (!result) return c.json({ error: 'League not found' }, 404);
    if ('error' in result) return c.json({ error: result.error }, 400);
    const snap = store.snapshotFormatState(league.id);
    if (snap) {
      await withDb(c.env, c.executionCtx, (db) =>
        persistLeagueFormatState(db, user.sub, league.id, snap),
      );
    }
    return c.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'Could not claim team', detail }, 500);
  }
});

app.post('/api/leagues/:id/auction/reset', async (c) => {
  const user = c.get('user');
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const result = store.resetWfflAuction(league.id);
    if (!result) return c.json({ error: 'League not found' }, 404);
    if ('error' in result) return c.json({ error: result.error }, 400);
    const snap = store.snapshotFormatState(league.id);
    if (snap) {
      await withDb(c.env, c.executionCtx, (db) =>
        persistLeagueFormatState(db, user.sub, league.id, snap),
      );
    }
    return c.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'Could not reset auction', detail }, 500);
  }
});

app.post('/api/leagues/:id/auction/release', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ playerId?: string }>();
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    if (!body.playerId) return c.json({ error: 'playerId required' }, 400);
    const result = store.releaseAuctionContract(league.id, body.playerId);
    if (!result) return c.json({ error: 'League not found' }, 404);
    if ('error' in result) return c.json({ error: result.error }, 400);
    const snap = store.snapshotFormatState(league.id);
    if (snap) {
      await withDb(c.env, c.executionCtx, (db) =>
        persistLeagueFormatState(db, user.sub, league.id, snap),
      );
    }
    return c.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'Could not drop contract', detail }, 500);
  }
});

app.put('/api/leagues/:id/auction/contract-rules', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Record<string, unknown>>();
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const saved = store.setContractRules(league.id, body as never);
    if (!saved) return c.json({ error: 'League not found' }, 404);
    return c.json(saved);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'Could not update contract rules', detail }, 500);
  }
});
app.post('/api/leagues/:id/calibration/propose', (c) =>
  c.json({ error: 'Not implemented on edge' }, 501),
);
app.post('/api/leagues/:id/calibration/apply', (c) =>
  c.json({ error: 'Not implemented on edge' }, 501),
);

async function guardedGet(
  c: {
    env: Env;
    executionCtx: { waitUntil(promise: Promise<unknown>): void };
    get: (k: 'user') => WorkerUser;
    req: { param: (k: string) => string };
    json: (body: unknown, status?: ContentfulStatusCode) => Response;
  },
  handler: (leagueId: string) => unknown,
) {
  const user = c.get('user');
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const result = handler(league.id);
    if (result == null) return c.json({ error: 'League not found' }, 404);
    return c.json(result);
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
}

app.get('/api/leagues/:id/scoring-summary', (c) =>
  guardedGet(c, (id) => store.scoringSummary(id)),
);
app.get('/api/leagues/:id/board', (c) => guardedGet(c, (id) => store.getBoard(id)));
app.get('/api/leagues/:id/draft', (c) => guardedGet(c, (id) => store.getDraft(id)));
app.get('/api/leagues/:id/adherence', (c) => guardedGet(c, (id) => store.adherence(id)));
app.get('/api/leagues/:id/recap', (c) => guardedGet(c, (id) => store.recap(id)));
app.get('/api/leagues/:id/flags', (c) => guardedGet(c, (id) => store.getFlags(id)));

app.get('/api/strategies', (c) => c.json(store.strategies()));

app.get('/api/draft-slots', (c) => {
  const teamCount = Number(c.req.query('teamCount') ?? 12);
  const rounds = Number(c.req.query('rounds') ?? 15);
  const slot = c.req.query('slot');
  if (slot) return c.json(getDraftSlotInfo(Number(slot), teamCount, rounds));
  return c.json(Array.from({ length: teamCount }, (_, i) => getDraftSlotInfo(i + 1, teamCount, rounds)));
});

app.post('/api/leagues/:id/simulate', async (c) => {
  const user = c.get('user');
  let body: {
    strategyId?: StrategyId;
    iterations?: number;
    rounds?: number;
    seed?: number;
    draftSlot?: number;
    adpVarianceRatio?: number;
    adpVarianceFloor?: number;
  } = {};
  try {
    body = (await c.req.json()) ?? {};
  } catch {
    body = {};
  }
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const result = store.simulate(league.id, body);
    if (!result) return c.json({ error: 'League not found' }, 404);
    return c.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', route: 'simulate', detail }));
    return c.json({ error: 'Simulation failed', detail }, 500);
  }
});

app.post('/api/leagues/:id/compare-strategies', async (c) => {
  const user = c.get('user');
  let body: {
    strategyIds?: StrategyId[];
    iterations?: number;
    rounds?: number;
    seed?: number;
    draftSlot?: number;
    adpVarianceRatio?: number;
    adpVarianceFloor?: number;
  } = {};
  try {
    body = (await c.req.json()) ?? {};
  } catch {
    body = {};
  }
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const result = store.compare(league.id, body);
    if (!result) return c.json({ error: 'League not found' }, 404);
    return c.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: 'error', route: 'compare-strategies', detail }));
    // Simulation failures are not DB outages — return a clear 500 with detail.
    return c.json({ error: 'Simulation failed', detail }, 500);
  }
});

app.get('/api/leagues/:id/cheat-sheet', (c) => guardedGet(c, (id) => store.cheatSheet(id)));
app.get('/api/leagues/:id/dynasty', (c) => guardedGet(c, (id) => store.dynastyOverview(id)));
app.get('/api/leagues/:id/auction/values', (c) => guardedGet(c, (id) => store.auctionState(id)));
app.get('/api/leagues/:id/auction/max-bid', async (c) => {
  const user = c.get('user');
  const playerId = c.req.query('playerId');
  if (!playerId) return c.json({ error: 'playerId required' }, 400);
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const result = store.auctionMaxBid(league.id, playerId);
    if (!result) return c.json({ error: 'League not found' }, 404);
    return c.json(result);
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});
app.get('/api/leagues/:id/auction/nominations', async (c) => {
  const user = c.get('user');
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'League not found' }, 404);
    const state = store.auctionState(league.id);
    if (!state) return c.json({ error: 'League not found' }, 404);
    return c.json({ nominations: state.nominations, inflationRate: state.inflationRate });
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.post('/api/leagues/:id/auction/contract-preview', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ playerId: string; annualSalary: number; years: number }>();
  try {
    const league = await withDb(c.env, c.executionCtx, (db) =>
      ownedLeague(store, db, user.sub, c.req.param('id')),
    );
    if (!league) return c.json({ error: 'Player or league not found' }, 404);
    const result = store.auctionContractPreview(league.id, body);
    if (!result) return c.json({ error: 'Player or league not found' }, 404);
    return c.json(result);
  } catch (err) {
    return c.json(dbUnavailable(err instanceof Error ? err.message : String(err)), 503);
  }
});

app.get('/api/leagues/:id/calibration', (c) =>
  guardedGet(c, (id) => store.calibrationSummary(id)),
);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(JSON.stringify({ level: 'error', message: err.message, stack: err.stack }));
  return c.json({ error: 'Internal error', detail: err.message }, 500);
});

export default app;

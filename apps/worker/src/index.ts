import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { StrategyId } from '@draftlab/domain';
import {
  scoringConfirmation,
  SCORING_PRESETS,
  sharedSleeperLimiter,
} from '@draftlab/integrations';
import { getDraftSlotInfo } from '@draftlab/strategy-engine';
import playerFactors from '../../api/data/player_factors.json' with { type: 'json' };
import {
  seedPlayersFromArtifact,
  type PlayerFactorsArtifact,
} from '../../api/src/data/load-artifact.js';
import { AppStore } from '../../api/src/services/store.js';
import { persistenceUnavailable, requireAccessJwt } from './auth.js';

const { players: ARTIFACT_PLAYERS, skipped: artifactSkipped } = seedPlayersFromArtifact(
  playerFactors as unknown as PlayerFactorsArtifact,
);
if (ARTIFACT_PLAYERS.length === 0) {
  throw new Error('[worker] loaded 0 players from bundled player_factors.json');
}
if (artifactSkipped.length) {
  console.warn(
    `[worker] ${artifactSkipped.length} artifact player(s) skipped (incomplete bio)`,
  );
}

const store = new AppStore(ARTIFACT_PLAYERS);

const app = new Hono<{ Bindings: Env; Variables: { user: { sub: string; email: string; displayName: string } } }>();

app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    credentials: true,
  }),
);

app.all('/auth/*', (c) => c.json(persistenceUnavailable(), 503));
app.all('/me', (c) => c.json(persistenceUnavailable(), 503));

app.use('/api/leagues/*', requireAccessJwt);
app.use('/api/leagues', requireAccessJwt);

app.get('/api/health', async (c) => {
  let deployedAt = await c.env.DRAFTLAB_KV.get('deployedAt');
  if (!deployedAt) {
    deployedAt = new Date().toISOString();
    await c.env.DRAFTLAB_KV.put('deployedAt', deployedAt);
  }
  return c.json({
    ok: true,
    service: c.env.SERVICE_NAME,
    runtime: 'cloudflare-workers',
    deployedAt,
  });
});

app.get('/api/players', (c) =>
  c.json(
    store.listPlayers().map((player) => ({
      player,
      evaluation: store.getEvaluation(player.id),
    })),
  ),
);

app.get('/api/players/:id', (c) => {
  const player = store.getPlayer(c.req.param('id'));
  if (!player) return c.json({ error: 'Player not found' }, 404);
  return c.json({ player, evaluation: store.getEvaluation(player.id) });
});

app.get('/api/leagues', (c) => {
  const user = c.get('user');
  return c.json(store.listLeagues(user.sub));
});

app.get('/api/sleeper/limiter', (c) => c.json(sharedSleeperLimiter.snapshot()));

app.get('/api/leagues/:id', (c) => {
  const user = c.get('user');
  const league = store.assertOwns(user.sub, c.req.param('id'));
  if (!league) return c.json({ error: 'League not found' }, 404);
  return c.json({ ...league, scoringSummary: scoringConfirmation(league) });
});

app.get('/api/scoring-presets', (c) => c.json(SCORING_PRESETS));

app.post('/api/leagues/manual', async (c) => c.json(persistenceUnavailable(), 503));

app.post('/api/leagues/sleeper/connect', async (c) => c.json(persistenceUnavailable(), 503));

app.post('/api/leagues/:id/recalculate', (c) => c.json(persistenceUnavailable(), 503));
app.patch('/api/leagues/:id', async (c) => c.json(persistenceUnavailable(), 503));
app.post('/api/leagues/:id/draft/picks', async (c) => c.json(persistenceUnavailable(), 503));
app.post('/api/leagues/:id/draft/start-polling', (c) => c.json(persistenceUnavailable(), 503));
app.post('/api/leagues/:id/draft/manual-mode', (c) => c.json(persistenceUnavailable(), 503));
app.post('/api/leagues/:id/flags', async (c) => c.json(persistenceUnavailable(), 503));
app.post('/api/leagues/:id/dynasty/mode', async (c) => c.json(persistenceUnavailable(), 503));
app.post('/api/leagues/:id/auction/bid', async (c) => c.json(persistenceUnavailable(), 503));
app.put('/api/leagues/:id/auction/contract-rules', async (c) => c.json(persistenceUnavailable(), 503));
app.post('/api/leagues/:id/calibration/propose', (c) => c.json(persistenceUnavailable(), 503));
app.post('/api/leagues/:id/calibration/apply', (c) => c.json(persistenceUnavailable(), 503));

app.get('/api/leagues/:id/scoring-summary', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const summary = store.scoringSummary(c.req.param('id'));
  if (!summary) return c.json({ error: 'League not found' }, 404);
  return c.json(summary);
});

app.get('/api/leagues/:id/board', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  return c.json(store.getBoard(c.req.param('id')));
});

app.get('/api/leagues/:id/draft', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const draft = store.getDraft(c.req.param('id'));
  if (!draft) return c.json({ error: 'Draft not found' }, 404);
  return c.json(draft);
});

app.get('/api/leagues/:id/adherence', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const result = store.adherence(c.req.param('id'));
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.get('/api/leagues/:id/recap', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const result = store.recap(c.req.param('id'));
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});


app.get('/api/leagues/:id/flags', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  return c.json(store.getFlags(c.req.param('id')));
});

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
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const body = await c.req.json<{
    strategyId?: StrategyId;
    iterations?: number;
    rounds?: number;
    seed?: number;
  }>();
  const result = store.simulate(c.req.param('id'), body ?? {});
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.post('/api/leagues/:id/compare-strategies', async (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const body = await c.req.json<{
    strategyIds?: StrategyId[];
    iterations?: number;
    rounds?: number;
    seed?: number;
  }>();
  const result = store.compare(c.req.param('id'), body ?? {});
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.get('/api/leagues/:id/cheat-sheet', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const result = store.cheatSheet(c.req.param('id'));
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.get('/api/leagues/:id/dynasty', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const overview = store.dynastyOverview(c.req.param('id'));
  if (!overview) return c.json({ error: 'League not found' }, 404);
  return c.json(overview);
});

app.get('/api/leagues/:id/auction/values', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const state = store.auctionState(c.req.param('id'));
  if (!state) return c.json({ error: 'League not found' }, 404);
  return c.json(state);
});

app.get('/api/leagues/:id/auction/max-bid', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const playerId = c.req.query('playerId');
  if (!playerId) return c.json({ error: 'playerId required' }, 400);
  const result = store.auctionMaxBid(c.req.param('id'), playerId);
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.get('/api/leagues/:id/auction/nominations', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const state = store.auctionState(c.req.param('id'));
  if (!state) return c.json({ error: 'League not found' }, 404);
  return c.json({ nominations: state.nominations, inflationRate: state.inflationRate });
});

app.post('/api/leagues/:id/auction/contract-preview', async (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const body = await c.req.json<{ playerId: string; annualSalary: number; years: number }>();
  const result = store.auctionContractPreview(c.req.param('id'), body);
  if (!result) return c.json({ error: 'Player or league not found' }, 404);
  return c.json(result);
});

app.get('/api/leagues/:id/calibration', (c) => {
  const user = c.get('user');
  if (!store.assertOwns(user.sub, c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  const summary = store.calibrationSummary(c.req.param('id'));
  if (!summary) return c.json({ error: 'League not found' }, 404);
  return c.json(summary);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(JSON.stringify({ level: 'error', message: err.message, stack: err.stack }));
  return c.json({ error: 'Internal error', detail: err.message }, 500);
});

export default app;

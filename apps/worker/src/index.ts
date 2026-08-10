import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContractRules, DraftType, DynastyMode, LeagueType, RosterShape, StrategyId } from '@draftlab/domain';
import {
  createManualLeague,
  mapSleeperLeague,
  resolveDraftSlot,
  rosterPresetForScoring,
  scoringConfirmation,
  SCORING_PRESETS,
  SleeperClient,
  sharedSleeperLimiter,
} from '@draftlab/integrations';
import { getDraftSlotInfo } from '@draftlab/strategy-engine';
import { SEED_PLAYERS } from '../../api/src/data/seed-players.js';
import { AppStore } from '../../api/src/services/store.js';

const store = new AppStore(SEED_PLAYERS);

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({ origin: '*' }));

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

app.get('/api/leagues', (c) => c.json(store.listLeagues()));

app.get('/api/sleeper/limiter', (c) => c.json(sharedSleeperLimiter.snapshot()));

app.get('/api/leagues/:id', (c) => {
  const league = store.getLeague(c.req.param('id'));
  if (!league) return c.json({ error: 'League not found' }, 404);
  return c.json({ ...league, scoringSummary: scoringConfirmation(league) });
});

app.get('/api/scoring-presets', (c) => c.json(SCORING_PRESETS));

app.post('/api/leagues/manual', async (c) => {
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

  const scoring = SCORING_PRESETS.find((p) => p.id === body.scoringPresetId) ?? SCORING_PRESETS[0]!;
  const baseRoster = rosterPresetForScoring(body.scoringPresetId);
  const roster: RosterShape = {
    ...baseRoster,
    ...body.roster,
    totalStarters: 0,
  };
  roster.totalStarters = roster.qb + roster.rb + roster.wr + roster.te + roster.flex + roster.superflex;

  const league = createManualLeague({
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
  const saved = store.upsertLeague(league);
  store.recalculateForLeague(saved.id);
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
});

app.post('/api/leagues/sleeper/connect', async (c) => {
  const body = await c.req.json<{ username: string; season?: number }>();
  const client = new SleeperClient();
  try {
    const user = await client.getUser(body.username);
    const season = body.season ?? new Date().getFullYear();
    const leagues = await client.getUserLeagues(user.user_id, season);
    const mapped = [];
    for (const l of leagues) {
      let draft = null;
      try {
        const drafts = await client.getLeagueDrafts(l.league_id);
        draft = drafts[0] ?? null;
      } catch {
        draft = null;
      }
      const league = mapSleeperLeague(l, { draft });
      league.sleeperUserId = user.user_id;
      if (draft && user.user_id) {
        league.draftSlot = resolveDraftSlot(draft, user.user_id) ?? league.draftSlot;
      }
      const saved = store.upsertLeague(league);
      store.recalculateForLeague(saved.id);
      mapped.push({
        ...saved,
        scoringSummary: scoringConfirmation(saved),
      });
    }
    return c.json({ user, leagues: mapped, limiter: client.limiterSnapshot() });
  } catch (err) {
    return c.json(
      {
        error: 'Failed to reach Sleeper',
        detail: err instanceof Error ? err.message : String(err),
        limiter: sharedSleeperLimiter.snapshot(),
      },
      502,
    );
  }
});

app.post('/api/leagues/:id/recalculate', (c) => {
  const result = store.recalculateForLeague(c.req.param('id'));
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.get('/api/leagues/:id/scoring-summary', (c) => {
  const summary = store.scoringSummary(c.req.param('id'));
  if (!summary) return c.json({ error: 'League not found' }, 404);
  return c.json(summary);
});

app.patch('/api/leagues/:id', async (c) => {
  const body = await c.req.json<
    Partial<{
      strategyId: StrategyId;
      draftSlot: number;
      sleeperDraftId: string;
      name: string;
    }>
  >();
  const league = store.updateLeague(c.req.param('id'), body);
  if (!league) return c.json({ error: 'League not found' }, 404);
  return c.json({ ...league, scoringSummary: scoringConfirmation(league) });
});

app.get('/api/leagues/:id/board', (c) => {
  if (!store.getLeague(c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  return c.json(store.getBoard(c.req.param('id')));
});

app.get('/api/leagues/:id/draft', (c) => {
  const draft = store.getDraft(c.req.param('id'));
  if (!draft) return c.json({ error: 'Draft not found' }, 404);
  return c.json(draft);
});

app.get('/api/leagues/:id/adherence', (c) => {
  const result = store.adherence(c.req.param('id'));
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.get('/api/leagues/:id/recap', (c) => {
  const result = store.recap(c.req.param('id'));
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.post('/api/leagues/:id/draft/start-polling', (c) => {
  const league = store.getLeague(c.req.param('id'));
  if (!league?.sleeperDraftId) {
    return c.json({ error: 'League has no Sleeper draft id — use manual picks' }, 400);
  }
  // Durable Object poller not wired yet — mark as polling and return draft state.
  store.patchDraft(c.req.param('id'), {
    syncMode: 'polling',
    syncBanner: 'Sleeper polling runs on the Node API today; Worker uses manual picks.',
  });
  return c.json(store.getDraft(c.req.param('id')));
});

app.post('/api/leagues/:id/draft/manual-mode', (c) => {
  const draft = store.patchDraft(c.req.param('id'), {
    syncMode: 'manual',
    syncBanner: 'Manual pick entry — Sleeper polling paused.',
  });
  if (!draft) return c.json({ error: 'Draft not found' }, 404);
  return c.json(draft);
});

app.post('/api/leagues/:id/draft/picks', async (c) => {
  const body = await c.req.json<{
    pickNumber: number;
    round: number;
    slot: number;
    playerId: string;
    rosterId?: string;
  }>();
  const draft = store.getDraft(c.req.param('id'));
  if (!draft) return c.json({ error: 'Draft not found' }, 404);
  const updated = store.applyPick(c.req.param('id'), {
    pickNumber: body.pickNumber,
    round: body.round,
    slot: body.slot,
    playerId: body.playerId,
    rosterId: body.rosterId ?? draft.userRosterId,
    source: 'manual',
  });
  return c.json({
    draft: updated,
    board: store.getBoard(c.req.param('id')),
    adherence: store.adherence(c.req.param('id')),
  });
});

app.post('/api/leagues/:id/flags', async (c) => {
  const body = await c.req.json<{ playerId: string; kind: 'target' | 'avoid'; value?: boolean }>();
  if (!store.getLeague(c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
  store.setFlag(c.req.param('id'), body.playerId, body.kind, body.value ?? true);
  return c.json({ ok: true, ...store.getFlags(c.req.param('id')) });
});

app.get('/api/leagues/:id/flags', (c) => {
  if (!store.getLeague(c.req.param('id'))) return c.json({ error: 'League not found' }, 404);
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
  const result = store.cheatSheet(c.req.param('id'));
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.get('/api/leagues/:id/dynasty', (c) => {
  const overview = store.dynastyOverview(c.req.param('id'));
  if (!overview) return c.json({ error: 'League not found' }, 404);
  return c.json(overview);
});

app.post('/api/leagues/:id/dynasty/mode', async (c) => {
  const body = await c.req.json<{ mode: DynastyMode }>();
  const league = store.setDynastyMode(c.req.param('id'), body.mode);
  if (!league) return c.json({ error: 'League not found' }, 404);
  return c.json(store.dynastyOverview(c.req.param('id')));
});

app.get('/api/leagues/:id/auction/values', (c) => {
  const state = store.auctionState(c.req.param('id'));
  if (!state) return c.json({ error: 'League not found' }, 404);
  return c.json(state);
});

app.post('/api/leagues/:id/auction/bid', async (c) => {
  const body = await c.req.json<{
    playerId: string;
    amount: number;
    rosterId?: string;
    contractYears?: number;
  }>();
  const result = store.placeAuctionBid(c.req.param('id'), body);
  if (!result) return c.json({ error: 'League not found' }, 404);
  if ('error' in result) return c.json(result, 400);
  return c.json(result);
});

app.get('/api/leagues/:id/auction/max-bid', (c) => {
  const playerId = c.req.query('playerId');
  if (!playerId) return c.json({ error: 'playerId required' }, 400);
  const result = store.auctionMaxBid(c.req.param('id'), playerId);
  if (!result) return c.json({ error: 'League not found' }, 404);
  return c.json(result);
});

app.get('/api/leagues/:id/auction/nominations', (c) => {
  const state = store.auctionState(c.req.param('id'));
  if (!state) return c.json({ error: 'League not found' }, 404);
  return c.json({ nominations: state.nominations, inflationRate: state.inflationRate });
});

app.post('/api/leagues/:id/auction/contract-preview', async (c) => {
  const body = await c.req.json<{ playerId: string; annualSalary: number; years: number }>();
  const result = store.auctionContractPreview(c.req.param('id'), body);
  if (!result) return c.json({ error: 'Player or league not found' }, 404);
  return c.json(result);
});

app.put('/api/leagues/:id/auction/contract-rules', async (c) => {
  const body = await c.req.json<Partial<ContractRules>>();
  const rules = store.setContractRules(c.req.param('id'), body);
  if (!rules) return c.json({ error: 'League not found' }, 404);
  return c.json(rules);
});

app.get('/api/leagues/:id/calibration', (c) => {
  const summary = store.calibrationSummary(c.req.param('id'));
  if (!summary) return c.json({ error: 'League not found' }, 404);
  return c.json(summary);
});

app.post('/api/leagues/:id/calibration/propose', (c) => {
  const proposal = store.proposeLeagueCalibration(c.req.param('id'));
  if (!proposal) return c.json({ error: 'League not found' }, 404);
  return c.json(proposal);
});

app.post('/api/leagues/:id/calibration/apply', (c) => {
  const applied = store.applyLeagueCalibration(c.req.param('id'));
  if (!applied) return c.json({ error: 'League not found' }, 404);
  return c.json(applied);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(JSON.stringify({ level: 'error', message: err.message, stack: err.stack }));
  return c.json({ error: 'Internal error', detail: err.message }, 500);
});

export default app;

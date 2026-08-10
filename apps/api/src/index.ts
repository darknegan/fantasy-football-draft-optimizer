import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { createAppStore } from './create-store.js';
import { assertDbReady, getPool, isDbConnectionError, requireEnv } from './db/pool.js';
import { createUser, findUserByEmail } from './db/users.js';
import { upsertLeagueRow } from './db/leagues.js';
import { hashPassword } from './auth/password.js';
import { verifyAccessToken } from './auth/tokens.js';
import { registerAuthDecorators, getBearerToken } from './auth/plugin.js';
import { DraftPoller } from './services/draft-poller.js';
import { playerRoutes } from './routes/players.js';
import { leagueRoutes } from './routes/leagues.js';
import { strategyRoutes } from './routes/strategies.js';
import { formatRoutes } from './routes/formats.js';
import { authRoutes } from './routes/auth.js';
import { loadEnv } from './load-env.js';

function corsOrigins(): boolean | string[] {
  const raw = process.env['CORS_ORIGINS'] ?? 'http://localhost:4200';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function maybeSeedDemoUser(pool: ReturnType<typeof getPool>, store: ReturnType<typeof createAppStore>) {
  if (process.env['SEED_DEMO_USER'] !== 'true') return;
  const email = process.env['DEMO_USER_EMAIL'] ?? 'demo@draftlab.local';
  const password = process.env['DEMO_USER_PASSWORD'] ?? 'demopassword';
  let user = await findUserByEmail(pool, email);
  if (!user) {
    user = await createUser(pool, {
      email,
      displayName: 'Demo User',
      passwordHash: await hashPassword(password),
    });
  }
  const demos = store.seedDemoLeagues(user.id);
  for (const league of [demos.demo, demos.dynasty, demos.auction]) {
    await upsertLeagueRow(pool, league);
  }
  console.log(`Seeded demo user ${email} with ${3} leagues`);
}

async function main() {
  loadEnv();
  requireEnv('DATABASE_URL');
  requireEnv('JWT_ACCESS_SECRET');
  requireEnv('JWT_REFRESH_SECRET');

  const PORT = Number(process.env['PORT'] ?? 3001);
  const HOST = process.env['HOST'] ?? '0.0.0.0';

  const pool = getPool();
  await assertDbReady(pool);
  const store = createAppStore();
  await maybeSeedDemoUser(pool, store);

  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: corsOrigins(),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
  });
  await app.register(websocket);
  await registerAuthDecorators(app);

  app.setErrorHandler((err, _req, reply) => {
    if (isDbConnectionError(err)) {
      app.log.error(err);
      return reply.code(503).send({
        error: 'Database unavailable',
        detail:
          'Postgres refused the connection. Start it with `docker compose up -d postgres` ' +
          'and confirm DATABASE_URL in apps/api/.env.',
      });
    }
    app.log.error(err);
    const statusCode =
      typeof err === 'object' && err && 'statusCode' in err && typeof err.statusCode === 'number'
        ? err.statusCode
        : 500;
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : (err as Error).message,
      message: (err as Error).message,
    });
  });

  const sockets = new Map<
    string,
    Set<{ readyState: number; OPEN: number; send: (data: string) => void; userId?: string }>
  >();

  const poller = new DraftPoller(store, undefined, (leagueId, payload) => {
    const set = sockets.get(leagueId);
    if (!set) return;
    const data = JSON.stringify(payload);
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  });

  app.get('/api/health', async () => {
    try {
      await pool.query('SELECT 1');
      return { ok: true, service: 'draftlab-api', database: 'up' };
    } catch {
      return { ok: false, service: 'draftlab-api', database: 'down' };
    }
  });

  await authRoutes(app, pool);
  await playerRoutes(app, store);
  await leagueRoutes(app, store, poller, pool);
  await strategyRoutes(app, store, pool);
  await formatRoutes(app, store, pool);

  app.get<{ Params: { leagueId: string }; Querystring: { access_token?: string } }>(
    '/ws/draft/:leagueId',
    { websocket: true },
    async (socket, req) => {
      const { leagueId } = req.params;
      let token = req.query.access_token ?? null;
      const proto = req.headers['sec-websocket-protocol'];
      if (!token && typeof proto === 'string') {
        const part = proto.split(',').map((s) => s.trim()).find((s) => s.startsWith('bearer.'));
        if (part) token = part.slice('bearer.'.length);
      }
      if (!token) token = getBearerToken(req);

      let userId: string | null = null;
      try {
        if (token) userId = (await verifyAccessToken(token)).sub;
      } catch {
        userId = null;
      }

      if (!userId || !store.assertOwns(userId, leagueId)) {
        socket.send(JSON.stringify({ type: 'error', error: 'Unauthorized' }));
        socket.close();
        return;
      }

      const tracked = socket as typeof socket & { userId?: string };
      tracked.userId = userId;

      if (!sockets.has(leagueId)) sockets.set(leagueId, new Set());
      sockets.get(leagueId)!.add(tracked);

      socket.send(
        JSON.stringify({
          type: 'hello',
          draft: store.getDraft(leagueId),
          board: store.getBoard(leagueId).slice(0, 40),
        }),
      );

      socket.on('message', (raw) => {
        try {
          if (!tracked.userId || !store.assertOwns(tracked.userId, leagueId)) return;
          const msg = JSON.parse(String(raw)) as {
            type: string;
            playerId?: string;
            pickNumber?: number;
            round?: number;
            slot?: number;
          };
          if (msg.type === 'manual_pick' && msg.playerId && msg.pickNumber && msg.round && msg.slot) {
            const draft = store.getDraft(leagueId);
            if (!draft) return;
            store.applyPick(leagueId, {
              pickNumber: msg.pickNumber,
              round: msg.round,
              slot: msg.slot,
              playerId: msg.playerId,
              rosterId: draft.userRosterId,
              source: 'manual',
            });
            const payload = JSON.stringify({
              type: 'draft_update',
              draft: store.getDraft(leagueId),
              board: store.getBoard(leagueId).slice(0, 40),
            });
            for (const ws of sockets.get(leagueId) ?? []) {
              if (ws.readyState === ws.OPEN) ws.send(payload);
            }
          }
        } catch {
          // ignore malformed
        }
      });

      socket.on('close', () => {
        sockets.get(leagueId)?.delete(tracked);
      });
    },
  );

  await app.listen({ port: PORT, host: HOST });
  console.log(`DraftLab API listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

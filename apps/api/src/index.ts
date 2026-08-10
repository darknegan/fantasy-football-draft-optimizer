import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { createAppStore } from './create-store.js';
import { DraftPoller } from './services/draft-poller.js';
import { playerRoutes } from './routes/players.js';
import { leagueRoutes } from './routes/leagues.js';
import { strategyRoutes } from './routes/strategies.js';
import { formatRoutes } from './routes/formats.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

async function main() {
  const store = createAppStore();
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  const sockets = new Map<string, Set<{ readyState: number; OPEN: number; send: (data: string) => void }>>();

  const poller = new DraftPoller(store, undefined, (leagueId, payload) => {
    const set = sockets.get(leagueId);
    if (!set) return;
    const data = JSON.stringify(payload);
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  });

  app.get('/api/health', async () => ({ ok: true, service: 'draftlab-api' }));

  await playerRoutes(app, store);
  await leagueRoutes(app, store, poller);
  await strategyRoutes(app, store);
  await formatRoutes(app, store);

  app.get<{ Params: { leagueId: string } }>('/ws/draft/:leagueId', { websocket: true }, (socket, req) => {
    const { leagueId } = req.params;
    if (!sockets.has(leagueId)) sockets.set(leagueId, new Set());
    sockets.get(leagueId)!.add(socket);

    socket.send(
      JSON.stringify({
        type: 'hello',
        draft: store.getDraft(leagueId),
        board: store.getBoard(leagueId).slice(0, 40),
      }),
    );

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; playerId?: string; pickNumber?: number; round?: number; slot?: number };
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
      sockets.get(leagueId)?.delete(socket);
    });
  });

  await app.listen({ port: PORT, host: HOST });
  console.log(`DraftLab API listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

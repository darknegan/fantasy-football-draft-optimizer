import type { FastifyInstance } from 'fastify';
import {
  SleeperApiError,
  sharedSleeperStatsClient,
  withHeadshot,
  type ScoringVariant as GameLogScoring,
  type SeasonType,
} from '@draftlab/integrations';
import type { AppStore } from '../services/store.js';

function parseSeasonType(raw: unknown): SeasonType {
  if (raw === 'post' || raw === 'pre' || raw === 'off' || raw === 'regular') return raw;
  return 'regular';
}

function parseScoring(raw: unknown): GameLogScoring {
  if (raw === 'std' || raw === 'standard') return 'std';
  if (raw === 'half_ppr' || raw === 'ppr') return raw;
  return 'ppr';
}

function scoringFromLeague(store: AppStore, leagueId: string | undefined): GameLogScoring | null {
  if (!leagueId) return null;
  const league = store.getLeague(leagueId);
  const variant = league?.scoring?.variant;
  if (variant === 'standard') return 'std';
  if (variant === 'half_ppr' || variant === 'ppr') return variant;
  return null;
}

export async function playerRoutes(app: FastifyInstance, store: AppStore) {
  app.get('/api/players', async () => {
    return store.listPlayers().map((player) => ({
      player: withHeadshot(player),
      evaluation: store.getEvaluation(player.id),
    }));
  });

  app.get<{ Params: { id: string } }>('/api/players/:id', async (req, reply) => {
    const player = store.getPlayer(req.params.id);
    if (!player) return reply.code(404).send({ error: 'Player not found' });
    return {
      player: withHeadshot(player),
      evaluation: store.getEvaluation(player.id),
    };
  });

  /**
   * Proxied Sleeper game log (undocumented stats host, cached in-process).
   * Query: season?, season_type=regular|post, scoring=ppr|half_ppr|std, leagueId?
   */
  app.get<{
    Params: { id: string };
    Querystring: {
      season?: string;
      season_type?: string;
      scoring?: string;
      leagueId?: string;
    };
  }>('/api/players/:id/game-log', async (req, reply) => {
    const player = store.getPlayer(req.params.id);
    if (!player) return reply.code(404).send({ error: 'Player not found' });

    const sleeperId = player.externalIds?.sleeper;
    if (!sleeperId) {
      return reply.code(404).send({ error: 'Player has no Sleeper id' });
    }

    let season: number;
    let seasonType: SeasonType = parseSeasonType(req.query.season_type);
    if (req.query.season) {
      season = Number(req.query.season);
      if (!Number.isFinite(season) || season < 2000 || season > 2100) {
        return reply.code(400).send({ error: 'Invalid season' });
      }
    } else {
      try {
        const defaults = await sharedSleeperStatsClient.defaultGameLogSeason();
        season = defaults.season;
        if (!req.query.season_type) seasonType = defaults.seasonType;
      } catch (err) {
        if (err instanceof SleeperApiError) {
          return reply.code(err.status === 429 ? 503 : 502).send({
            error: 'Failed to resolve NFL season from Sleeper',
            detail: err.message,
          });
        }
        throw err;
      }
    }

    const resolvedScoring =
      req.query.scoring != null
        ? parseScoring(req.query.scoring)
        : (scoringFromLeague(store, req.query.leagueId) ?? 'ppr');

    try {
      const gameLog = await sharedSleeperStatsClient.getPlayerGameLog({
        sleeperPlayerId: sleeperId,
        season,
        seasonType,
        scoring: resolvedScoring,
      });

      const seasons: number[] = [];
      // Anchor the picker on the latest completed/active season, not the selected year,
      // so switching back in time doesn't shrink the list.
      let anchor = season;
      try {
        const state = await sharedSleeperStatsClient.getNflState();
        const prev = Number(state.previous_season);
        const cur = Number(state.season);
        anchor = Math.max(season, prev || 0, state.season_type === 'pre' || state.season_type === 'off' ? prev : cur);
      } catch {
        /* keep season */
      }
      for (let y = anchor; y >= anchor - 4 && y >= 2015; y -= 1) seasons.push(y);

      return {
        playerId: player.id,
        sleeperId,
        headshotUrl: withHeadshot(player).headshotUrl,
        availableSeasons: seasons,
        gameLog,
        scoring: resolvedScoring,
      };
    } catch (err) {
      if (err instanceof SleeperApiError) {
        return reply.code(err.status === 429 ? 503 : 502).send({
          error: 'Failed to load game log from Sleeper',
          detail: err.message,
        });
      }
      throw err;
    }
  });
}

/**
 * Sleeper stats / projections live on api.sleeper.com (undocumented, best-effort).
 * Official league/draft docs are on api.sleeper.app/v1 — keep those on SleeperClient.
 *
 * Same shared rate limiter applies: all Sleeper egress shares one budget.
 */

import { SleeperApiError } from './client.js';
import {
  mapWeeklyGameLog,
  type PlayerGameLog,
  type ScoringVariant,
  type SleeperWeekStatRow,
} from './game-log.js';
import { sharedSleeperLimiter, type SleeperRateLimiter } from './rate-limiter.js';

const DEFAULT_STATS_BASE = 'https://api.sleeper.com';

export interface SleeperNflState {
  week: number;
  season: string;
  season_type: string;
  previous_season: string;
  league_season: string;
  display_week: number;
  season_has_scores: boolean;
}

export type SeasonType = 'regular' | 'post' | 'pre' | 'off';

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class SleeperStatsClient {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly baseUrl = DEFAULT_STATS_BASE,
    private readonly fetchImpl?: typeof fetch,
    private readonly limiter: SleeperRateLimiter = sharedSleeperLimiter,
    /** Official v1 host — only used for /state/nfl. */
    private readonly v1BaseUrl = 'https://api.sleeper.app/v1',
  ) {}

  private async request(url: string): Promise<Response> {
    if (this.fetchImpl) return this.fetchImpl(url);
    return fetch(url);
  }

  private async getJson<T>(url: string, pathForError: string): Promise<T> {
    await this.limiter.acquire();
    const res = await this.request(url);
    if (res.status === 429) {
      this.limiter.record429();
      throw new SleeperApiError(`Sleeper rate limited: ${pathForError}`, 429, pathForError);
    }
    if (!res.ok) {
      throw new SleeperApiError(
        `Sleeper ${pathForError} failed: ${res.status} ${res.statusText}`,
        res.status,
        pathForError,
      );
    }
    this.limiter.recordSuccess();
    return (await res.json()) as T;
  }

  private cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return Promise.resolve(hit.value as T);
    }
    return load().then((value) => {
      this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    });
  }

  /** Clear in-process cache (tests). */
  clearCache() {
    this.cache.clear();
  }

  getNflState(): Promise<SleeperNflState> {
    const path = '/state/nfl';
    return this.cached(`state:nfl`, 5 * 60_000, () =>
      this.getJson<SleeperNflState>(`${this.v1BaseUrl}${path}`, path),
    );
  }

  /**
   * Season-aggregated stats for one player.
   * GET /stats/nfl/player/{id}?season=&season_type=
   */
  getPlayerSeasonStats(
    sleeperPlayerId: string,
    season: number,
    seasonType: SeasonType = 'regular',
  ): Promise<SleeperWeekStatRow> {
    const path = `/stats/nfl/player/${encodeURIComponent(sleeperPlayerId)}?season=${season}&season_type=${seasonType}`;
    // Completed seasons are immutable; current season refreshes more often.
    const ttl = this.seasonCacheTtlMs(season);
    return this.cached(`season:${sleeperPlayerId}:${season}:${seasonType}`, ttl, () =>
      this.getJson<SleeperWeekStatRow>(`${this.baseUrl}${path}`, path),
    );
  }

  /**
   * Week-by-week game log for one player.
   * GET /stats/nfl/player/{id}?season=&season_type=&grouping=week
   */
  getPlayerWeeklyStats(
    sleeperPlayerId: string,
    season: number,
    seasonType: SeasonType = 'regular',
  ): Promise<Record<string, SleeperWeekStatRow>> {
    const path = `/stats/nfl/player/${encodeURIComponent(sleeperPlayerId)}?season=${season}&season_type=${seasonType}&grouping=week`;
    const ttl = this.seasonCacheTtlMs(season);
    return this.cached(`weekly:${sleeperPlayerId}:${season}:${seasonType}`, ttl, () =>
      this.getJson<Record<string, SleeperWeekStatRow>>(`${this.baseUrl}${path}`, path),
    );
  }

  async getPlayerGameLog(opts: {
    sleeperPlayerId: string;
    season: number;
    seasonType?: SeasonType;
    scoring?: ScoringVariant;
    includePostseason?: boolean;
  }): Promise<PlayerGameLog> {
    const seasonType = opts.seasonType ?? 'regular';
    const [weekly, seasonTotals] = await Promise.all([
      this.getPlayerWeeklyStats(opts.sleeperPlayerId, opts.season, seasonType),
      this.getPlayerSeasonStats(opts.sleeperPlayerId, opts.season, seasonType).catch(() => null),
    ]);

    return mapWeeklyGameLog({
      sleeperId: opts.sleeperPlayerId,
      season: opts.season,
      seasonType,
      scoring: opts.scoring,
      weekly,
      seasonTotals,
    });
  }

  /**
   * Default season to show in the Game Log tab: previous season during preseason/off,
   * otherwise the active league season.
   */
  async defaultGameLogSeason(): Promise<{ season: number; seasonType: SeasonType }> {
    const state = await this.getNflState();
    if (state.season_type === 'pre' || state.season_type === 'off') {
      return { season: Number(state.previous_season), seasonType: 'regular' };
    }
    return {
      season: Number(state.season),
      seasonType: (state.season_type as SeasonType) || 'regular',
    };
  }

  private seasonCacheTtlMs(season: number): number {
    // Heuristic without blocking on state: older seasons are cold.
    const year = new Date().getUTCFullYear();
    if (season < year) return 6 * 60 * 60_000; // 6h
    return 15 * 60_000; // 15m for current calendar year
  }
}

/** Process-wide shared stats client (shares limiter with SleeperClient). */
export const sharedSleeperStatsClient = new SleeperStatsClient();

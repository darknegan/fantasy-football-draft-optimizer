/**
 * Sleeper public API client.
 * Docs: https://docs.sleeper.com/
 * Rate limit: keep under ~1000 calls/min/IP — callers must share a limiter.
 */

import { sharedSleeperLimiter, type SleeperRateLimiter } from './rate-limiter.js';

const DEFAULT_BASE = 'https://api.sleeper.app/v1';

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  status: string;
  scoring_settings: Record<string, number>;
  roster_positions: string[];
  draft_id: string | null;
  settings: Record<string, number | string>;
}

export interface SleeperDraft {
  draft_id: string;
  status: string;
  type: string;
  sport: string;
  season: string;
  start_time: number | null;
  last_picked: number | null;
  settings: Record<string, number>;
  slot_to_roster_id: Record<string, number>;
  draft_order: Record<string, number> | null;
  metadata?: Record<string, string>;
}

export interface SleeperPick {
  pick_no: number;
  round: number;
  draft_slot: number;
  roster_id: number;
  player_id: string | null;
  picked_by: string;
  metadata?: Record<string, string>;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  starters: string[] | null;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string };
}

export class SleeperApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = 'SleeperApiError';
  }
}

export class SleeperClient {
  constructor(
    private readonly baseUrl = DEFAULT_BASE,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly limiter: SleeperRateLimiter = sharedSleeperLimiter,
  ) {}

  private async get<T>(path: string): Promise<T> {
    await this.limiter.acquire();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`);
    if (res.status === 429) {
      this.limiter.record429();
      throw new SleeperApiError(`Sleeper rate limited: ${path}`, 429, path);
    }
    if (!res.ok) {
      throw new SleeperApiError(`Sleeper ${path} failed: ${res.status} ${res.statusText}`, res.status, path);
    }
    this.limiter.recordSuccess();
    return (await res.json()) as T;
  }

  getUser(username: string): Promise<SleeperUser> {
    return this.get(`/user/${encodeURIComponent(username)}`);
  }

  getUserLeagues(userId: string, season: number): Promise<SleeperLeague[]> {
    return this.get(`/user/${userId}/leagues/nfl/${season}`);
  }

  getLeague(leagueId: string): Promise<SleeperLeague> {
    return this.get(`/league/${leagueId}`);
  }

  getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    return this.get(`/league/${leagueId}/rosters`);
  }

  getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
    return this.get(`/league/${leagueId}/users`);
  }

  getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
    return this.get(`/league/${leagueId}/drafts`);
  }

  getDraft(draftId: string): Promise<SleeperDraft> {
    return this.get(`/draft/${draftId}`);
  }

  getDraftPicks(draftId: string): Promise<SleeperPick[]> {
    return this.get(`/draft/${draftId}/picks`);
  }

  getPlayers(): Promise<Record<string, unknown>> {
    return this.get(`/players/nfl`);
  }

  limiterSnapshot() {
    return this.limiter.snapshot();
  }
}

/** Adaptive poll interval per plan §1.2. */
export function nextPollIntervalMs(opts: {
  draftStatus: string;
  picksUntilUser?: number | null;
  secondsRemaining?: number | null;
  consecutiveUnchanged: number;
  degraded?: boolean;
}): number {
  if (opts.degraded) return 30_000;
  if (opts.draftStatus === 'complete') return 0;
  if (opts.draftStatus !== 'drafting') return 15_000;
  if (opts.picksUntilUser != null && opts.picksUntilUser <= 3) return 2_000;
  if (opts.secondsRemaining != null && opts.secondsRemaining <= 30) return 1_500;
  if (opts.consecutiveUnchanged >= 5) return 5_000;
  return 2_500;
}

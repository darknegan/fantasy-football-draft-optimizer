/**
 * Sleeper public API client.
 * Docs: https://docs.sleeper.com/
 * Rate limit: keep under ~1000 calls/min/IP — callers must share a limiter.
 */

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
  settings: Record<string, number>;
  slot_to_roster_id: Record<string, number>;
  draft_order: Record<string, number> | null;
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

export class SleeperClient {
  constructor(
    private readonly baseUrl = DEFAULT_BASE,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`Sleeper ${path} failed: ${res.status} ${res.statusText}`);
    }
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

  getDraft(draftId: string): Promise<SleeperDraft> {
    return this.get(`/draft/${draftId}`);
  }

  getDraftPicks(draftId: string): Promise<SleeperPick[]> {
    return this.get(`/draft/${draftId}/picks`);
  }

  getPlayers(): Promise<Record<string, unknown>> {
    return this.get(`/players/nfl`);
  }
}

/** Adaptive poll interval: faster near active picks, slower when idle. */
export function nextPollIntervalMs(opts: {
  draftStatus: string;
  secondsRemaining?: number | null;
  consecutiveUnchanged: number;
}): number {
  if (opts.draftStatus !== 'drafting') return 15_000;
  if (opts.secondsRemaining != null && opts.secondsRemaining <= 30) return 1_500;
  if (opts.consecutiveUnchanged >= 5) return 5_000;
  return 2_500;
}

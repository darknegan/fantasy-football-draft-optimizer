import type { SleeperClient } from './client.js';

export interface CachedSleeperPlayer {
  sleeperId: string;
  name: string;
  team: string | null;
  position: string | null;
  status: string | null;
  injuryStatus: string | null;
}

/**
 * Daily cache for GET /players/nfl (~5MB). Fetch at most once per day.
 */
export class SleeperPlayerCache {
  private players = new Map<string, CachedSleeperPlayer>();
  private fetchedAt: number | null = null;
  private readonly ttlMs = 24 * 60 * 60 * 1000;

  constructor(private readonly client: SleeperClient) {}

  isFresh(now = Date.now()): boolean {
    return this.fetchedAt != null && now - this.fetchedAt < this.ttlMs;
  }

  async ensureFresh(): Promise<void> {
    if (this.isFresh()) return;
    const raw = await this.client.getPlayers();
    const next = new Map<string, CachedSleeperPlayer>();
    for (const [id, value] of Object.entries(raw)) {
      const p = value as Record<string, unknown>;
      const pos = String(p['position'] ?? '');
      if (!['QB', 'RB', 'WR', 'TE'].includes(pos)) continue;
      next.set(id, {
        sleeperId: id,
        name: String(p['full_name'] ?? `${p['first_name'] ?? ''} ${p['last_name'] ?? ''}`.trim()),
        team: (p['team'] as string | null) ?? null,
        position: pos,
        status: (p['status'] as string | null) ?? null,
        injuryStatus: (p['injury_status'] as string | null) ?? null,
      });
    }
    this.players = next;
    this.fetchedAt = Date.now();
  }

  get(id: string): CachedSleeperPlayer | undefined {
    return this.players.get(id);
  }

  size() {
    return this.players.size;
  }

  stats() {
    return { size: this.players.size, fetchedAt: this.fetchedAt, fresh: this.isFresh() };
  }
}

import { describe, expect, it, vi } from 'vitest';
import type { AuctionValuesArtifact } from '@draftlab/auction-engine';
import type { ArtifactCache, CachedArtifact } from '../artifact-cache.js';
import { ARTIFACT_TTL_MS } from '../artifact-provider.js';
import { loadAuctionBoards } from '../auction-artifact-provider.js';

function memoryCache(seed: Record<string, CachedArtifact> = {}): ArtifactCache {
  const map = new Map(Object.entries(seed));
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async put(key, value) {
      map.set(key, value);
    },
  };
}

function board(id: string): AuctionValuesArtifact {
  return {
    schema_version: 1,
    generated_at: '2026-08-17T00:00:00Z',
    id,
    label: id,
    budget: 200,
    num_teams: 12,
    roster_spots: 15,
    format: { ppr: 1, numQbs: 1, numTeams: 12, isDynasty: false },
    players: [],
  };
}

describe('loadAuctionBoards', () => {
  const bootstrap = {
    '1qb-full-ppr': board('1qb-full-ppr'),
    '1qb-half-ppr': board('1qb-half-ppr'),
    'superflex-full-ppr': board('superflex-full-ppr'),
  };

  it('serves fresh R2/cache boards', async () => {
    const now = Date.parse('2026-08-17T12:00:00Z');
    const loaded = await loadAuctionBoards({
      cache: memoryCache({
        'auction/1qb-full-ppr.json': {
          body: JSON.stringify({ ...board('1qb-full-ppr'), label: 'from-r2' }),
          fetchedAt: new Date(now - 60_000).toISOString(),
        },
      }),
      bootstrap,
      now: () => now,
      log: () => undefined,
    });
    expect(loaded.sources['1qb-full-ppr']).toBe('cache');
    expect(loaded.boards.find((b) => b.id === '1qb-full-ppr')?.label).toBe('from-r2');
    expect(loaded.sources['1qb-half-ppr']).toBe('bootstrap');
  });

  it('falls back to bootstrap when cache is empty', async () => {
    const loaded = await loadAuctionBoards({
      cache: memoryCache(),
      bootstrap,
      log: vi.fn(),
    });
    expect(loaded.boards).toHaveLength(3);
    expect(loaded.sources['superflex-full-ppr']).toBe('bootstrap');
  });

  it('serves stale cache past TTL', async () => {
    const now = Date.parse('2026-08-20T00:00:00Z');
    const log = vi.fn();
    const loaded = await loadAuctionBoards({
      cache: memoryCache({
        'auction/1qb-full-ppr.json': {
          body: JSON.stringify(board('1qb-full-ppr')),
          fetchedAt: new Date(now - ARTIFACT_TTL_MS - 1000).toISOString(),
        },
      }),
      bootstrap: { '1qb-full-ppr': { ...board('1qb-full-ppr'), label: 'boot' } },
      now: () => now,
      log,
    });
    expect(loaded.sources['1qb-full-ppr']).toBe('stale_cache');
    expect(log.mock.calls.some((c) => String(c[0]).includes('older than 7d'))).toBe(true);
  });
});

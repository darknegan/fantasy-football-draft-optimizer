import { describe, expect, it, vi } from 'vitest';
import type { ArtifactCache, CachedArtifact } from '../artifact-cache.js';
import { ARTIFACT_TTL_MS, loadArtifacts } from '../artifact-provider.js';
import type { PlayerFactorsArtifact } from '../load-artifact.js';
import type { BenchmarksArtifact } from '@draftlab/evaluation-engine';

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

const bootstrapFactors = {
  schema_version: 4,
  generated_at: '2020-01-01T00:00:00Z',
  players: [{ name: 'bootstrap' }],
} as unknown as PlayerFactorsArtifact;

const bootstrapBenchmarks = {
  schema_version: 2,
  generated_at: '2020-01-01T00:00:00Z',
  benchmarks: {},
} as BenchmarksArtifact;

const freshFactors = {
  schema_version: 4,
  generated_at: '2026-08-01T00:00:00Z',
  players: [{ name: 'from-r2' }],
} as unknown as PlayerFactorsArtifact;

const freshBenchmarks = {
  schema_version: 2,
  generated_at: '2026-08-01T00:00:00Z',
  benchmarks: { QB: { factors: [] } },
} as BenchmarksArtifact;

describe('loadArtifacts', () => {
  it('serves fresh cache', async () => {
    const now = Date.parse('2026-08-10T00:00:00Z');
    const loaded = await loadArtifacts({
      cache: memoryCache({
        'artifacts/player_factors.json': {
          body: JSON.stringify(freshFactors),
          fetchedAt: new Date(now - 60_000).toISOString(),
        },
        'artifacts/benchmarks.json': {
          body: JSON.stringify(freshBenchmarks),
          fetchedAt: new Date(now - 60_000).toISOString(),
        },
      }),
      bootstrapFactors,
      bootstrapBenchmarks,
      now: () => now,
    });
    expect(loaded.factorsSource).toBe('cache');
    expect(loaded.benchmarksSource).toBe('cache');
    expect((loaded.factors as { players: { name: string }[] }).players[0]?.name).toBe('from-r2');
  });

  it('serves stale cache when older than TTL and logs refresh hint', async () => {
    const now = Date.parse('2026-08-20T00:00:00Z');
    const staleFetched = new Date(now - ARTIFACT_TTL_MS - 1000).toISOString();
    const log = vi.fn();
    const loaded = await loadArtifacts({
      cache: memoryCache({
        'artifacts/player_factors.json': {
          body: JSON.stringify(freshFactors),
          fetchedAt: staleFetched,
        },
        'artifacts/benchmarks.json': {
          body: JSON.stringify(freshBenchmarks),
          fetchedAt: staleFetched,
        },
      }),
      bootstrapFactors,
      bootstrapBenchmarks,
      now: () => now,
      log,
    });
    expect(loaded.factorsSource).toBe('stale_cache');
    expect(loaded.benchmarksSource).toBe('stale_cache');
    expect(log.mock.calls.some((c) => String(c[0]).includes('publish-artifacts'))).toBe(true);
  });

  it('falls back to bootstrap when cache empty', async () => {
    const loaded = await loadArtifacts({
      cache: memoryCache(),
      bootstrapFactors,
      bootstrapBenchmarks,
      log: () => undefined,
    });
    expect(loaded.factorsSource).toBe('bootstrap');
    expect(loaded.benchmarksSource).toBe('bootstrap');
    expect((loaded.factors as { players: { name: string }[] }).players[0]?.name).toBe('bootstrap');
  });
});

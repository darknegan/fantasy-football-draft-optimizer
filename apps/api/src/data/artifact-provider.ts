/**
 * Cache-first loader for sleeperMCP player_factors + benchmarks.
 *
 * Order: R2/FS cache (7d fresh) → stale cache if present → bundled bootstrap.
 * Artifacts are published by sleeperMCP's GitHub Action into R2 — DraftLab
 * never rebuilds them in the request path.
 */

import type { ArtifactCache } from './artifact-cache.js';
import type { PlayerFactorsArtifact } from './load-artifact.js';
import type { BenchmarksArtifact } from '@draftlab/evaluation-engine';

export const ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const FACTORS_KEY = 'artifacts/player_factors.json';
export const BENCHMARKS_KEY = 'artifacts/benchmarks.json';

export interface ArtifactProviderOptions {
  cache: ArtifactCache;
  /** Bundled offline safety net. */
  bootstrapFactors: PlayerFactorsArtifact;
  bootstrapBenchmarks: BenchmarksArtifact;
  now?: () => number;
  log?: (msg: string) => void;
}

export interface LoadedArtifacts {
  factors: PlayerFactorsArtifact;
  benchmarks: BenchmarksArtifact;
  factorsSource: 'cache' | 'stale_cache' | 'bootstrap';
  benchmarksSource: 'cache' | 'stale_cache' | 'bootstrap';
}

function isFresh(fetchedAt: string, now: number): boolean {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return false;
  return now - t < ARTIFACT_TTL_MS;
}

async function loadOne<T>(
  opts: ArtifactProviderOptions,
  key: string,
  bootstrap: T,
  label: string,
): Promise<{ doc: T; source: 'cache' | 'stale_cache' | 'bootstrap' }> {
  const now = (opts.now ?? Date.now)();
  const log = opts.log ?? console.warn;
  const cached = await opts.cache.get(key);

  if (cached) {
    try {
      const doc = JSON.parse(cached.body) as T;
      if (isFresh(cached.fetchedAt, now)) {
        return { doc, source: 'cache' };
      }
      log(
        `[artifacts] ${label} cache older than 7d (fetchedAt=${cached.fetchedAt}); ` +
          `serving stale — run sleeperMCP publish-artifacts workflow to refresh R2`,
      );
      return { doc, source: 'stale_cache' };
    } catch {
      log(`[artifacts] corrupt ${label} cache; falling back to bootstrap`);
    }
  }

  log(`[artifacts] ${label} missing from cache; using bundled bootstrap`);
  return { doc: bootstrap, source: 'bootstrap' };
}

export async function loadArtifacts(opts: ArtifactProviderOptions): Promise<LoadedArtifacts> {
  const [factors, benchmarks] = await Promise.all([
    loadOne(opts, FACTORS_KEY, opts.bootstrapFactors, 'player_factors'),
    loadOne(opts, BENCHMARKS_KEY, opts.bootstrapBenchmarks, 'benchmarks'),
  ]);

  return {
    factors: factors.doc,
    benchmarks: benchmarks.doc,
    factorsSource: factors.source,
    benchmarksSource: benchmarks.source,
  };
}

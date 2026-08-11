import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  activateBenchmarkArtifact,
  type BenchmarksArtifact,
} from '@draftlab/evaluation-engine';
import { loadArtifacts } from './data/artifact-provider.js';
import { createFsArtifactCache } from './data/fs-artifact-cache.js';
import {
  seedPlayersFromArtifact,
  type PlayerFactorsArtifact,
} from './data/load-artifact.js';
import { SEED_PLAYERS } from './data/seed-players.js';
import { AppStore } from './services/store.js';

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

/**
 * Node bootstrap: FS cache (R2 stand-in) + bundled JSON safety net.
 * Populate the FS cache with `wrangler r2 object get` or a local build copy.
 * Workers use the same loadArtifacts helper with an R2 binding — see apps/worker.
 */
export async function createAppStore(): Promise<AppStore> {
  const moduleDir = fileURLToPath(new URL('.', import.meta.url));
  const bundledFactorsPath = resolve(moduleDir, '../data/player_factors.json');
  const bundledBenchmarksPath = resolve(moduleDir, '../data/benchmarks.json');

  const bootstrapFactors = existsSync(bundledFactorsPath)
    ? readJsonFile<PlayerFactorsArtifact>(bundledFactorsPath)
    : null;
  const bootstrapBenchmarks = existsSync(bundledBenchmarksPath)
    ? readJsonFile<BenchmarksArtifact>(bundledBenchmarksPath)
    : null;

  // Offline override: point at a local sleeperMCP artifact for hacking.
  const overridePath = process.env['SLEEPER_MCP_ARTIFACT_PATH'];
  if (overridePath && existsSync(overridePath)) {
    const doc = readJsonFile<PlayerFactorsArtifact>(overridePath);
    if (bootstrapBenchmarks) {
      activateBenchmarkArtifact(bootstrapBenchmarks);
    }
    const { players, skipped } = seedPlayersFromArtifact(doc);
    if (skipped.length) {
      console.warn(
        `[store] ${skipped.length} artifact player(s) skipped (incomplete bio): ` +
          skipped.map((s) => s.name).join(', '),
      );
    }
    console.log(`[store] loaded ${players.length} players from SLEEPER_MCP_ARTIFACT_PATH`);
    return new AppStore(players);
  }

  if (!bootstrapFactors || !bootstrapBenchmarks) {
    console.warn(
      `[store] bundled bootstrap missing; using in-repo SEED_PLAYERS (${SEED_PLAYERS.length})`,
    );
    return new AppStore(SEED_PLAYERS);
  }

  const cacheDir =
    process.env['DRAFTLAB_ARTIFACT_CACHE_DIR'] ??
    resolve(moduleDir, '../.cache/artifacts');

  const loaded = await loadArtifacts({
    cache: createFsArtifactCache(cacheDir),
    bootstrapFactors,
    bootstrapBenchmarks,
  });

  activateBenchmarkArtifact(loaded.benchmarks);
  const { players, skipped } = seedPlayersFromArtifact(loaded.factors);
  if (players.length === 0) {
    throw new Error('[store] loaded 0 players from artifact provider — every entry was skipped');
  }
  if (skipped.length) {
    console.warn(
      `[store] ${skipped.length} artifact player(s) skipped (incomplete bio): ` +
        skipped.map((s) => s.name).join(', '),
    );
  }
  console.log(
    `[store] loaded ${players.length} players ` +
      `(factors=${loaded.factorsSource}, benchmarks=${loaded.benchmarksSource})`,
  );
  return new AppStore(players);
}

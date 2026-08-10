import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSeedPlayersFromArtifactFile } from './data/load-artifact.js';
import { SEED_PLAYERS } from './data/seed-players.js';
import { AppStore } from './services/store.js';

/**
 * Node-only bootstrap: prefer sleeperMCP player_factors.json, else in-repo seeds.
 * Workers must construct AppStore with an imported seed list (no filesystem).
 */
export function createAppStore(): AppStore {
  const moduleDir = fileURLToPath(new URL('.', import.meta.url));
  const artifactPath =
    process.env['SLEEPER_MCP_ARTIFACT_PATH'] ??
    resolve(moduleDir, '../../../../../sleeperMCP/artifacts/player_factors.json');

  if (existsSync(artifactPath)) {
    const { players, skipped } = loadSeedPlayersFromArtifactFile(artifactPath);
    if (players.length === 0) {
      throw new Error(`[store] loaded 0 players from ${artifactPath} — every entry was skipped`);
    }
    if (skipped.length) {
      console.warn(
        `[store] ${skipped.length} artifact player(s) skipped (incomplete bio): ` +
          skipped.map((s) => s.name).join(', '),
      );
    }
    console.log(`[store] loaded ${players.length} players from ${artifactPath}`);
    return new AppStore(players);
  }

  console.warn(
    `[store] sleeperMCP artifact not found at ${artifactPath}; using in-repo SEED_PLAYERS ` +
      `(${SEED_PLAYERS.length}). Set SLEEPER_MCP_ARTIFACT_PATH or regenerate: ` +
      `cd sleeperMCP && python tools/build_factors.py`,
  );
  return new AppStore(SEED_PLAYERS);
}

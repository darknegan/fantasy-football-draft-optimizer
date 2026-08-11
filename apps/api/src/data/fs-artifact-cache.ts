import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ArtifactCache, CachedArtifact } from './artifact-cache.js';

const META_SUFFIX = '.meta.json';

/** Filesystem cache for the Node API (local / non-Worker deploys). */
export function createFsArtifactCache(rootDir: string): ArtifactCache {
  return {
    async get(key: string): Promise<CachedArtifact | null> {
      const path = resolve(rootDir, key);
      if (!existsSync(path)) return null;
      const body = readFileSync(path, 'utf-8');
      const metaPath = path + META_SUFFIX;
      let fetchedAt = statSync(path).mtime.toISOString();
      let generatedAt: string | undefined;
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as {
            fetchedAt?: string;
            generatedAt?: string;
          };
          fetchedAt = meta.fetchedAt ?? fetchedAt;
          generatedAt = meta.generatedAt;
        } catch {
          /* ignore corrupt meta */
        }
      }
      return { body, fetchedAt, generatedAt };
    },
    async put(key: string, value: CachedArtifact): Promise<void> {
      const path = resolve(rootDir, key);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, value.body, 'utf-8');
      writeFileSync(
        path + META_SUFFIX,
        JSON.stringify({
          fetchedAt: value.fetchedAt,
          generatedAt: value.generatedAt ?? null,
        }),
        'utf-8',
      );
    },
  };
}

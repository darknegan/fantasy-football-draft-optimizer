/**
 * Cache-first loader for sleeperMCP auction-value boards.
 *
 * Keys match the R2 objects published by sleeperMCP:
 *   auction/1qb-full-ppr.json
 *   auction/1qb-half-ppr.json
 *   auction/superflex-full-ppr.json
 */

import {
  AUCTION_BOARD_IDS,
  type AuctionBoardId,
  type AuctionValuesArtifact,
} from '@draftlab/auction-engine';
import type { ArtifactCache } from './artifact-cache.js';
import { ARTIFACT_TTL_MS } from './artifact-provider.js';

export const AUCTION_BOARD_KEYS: Record<AuctionBoardId, string> = {
  '1qb-full-ppr': 'auction/1qb-full-ppr.json',
  '1qb-half-ppr': 'auction/1qb-half-ppr.json',
  'superflex-full-ppr': 'auction/superflex-full-ppr.json',
};

export type AuctionBoardSource = 'cache' | 'stale_cache' | 'bootstrap';

export interface LoadedAuctionBoards {
  boards: AuctionValuesArtifact[];
  sources: Partial<Record<AuctionBoardId, AuctionBoardSource>>;
}

function isFresh(fetchedAt: string, now: number): boolean {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return false;
  return now - t < ARTIFACT_TTL_MS;
}

function isAuctionBoard(doc: unknown): doc is AuctionValuesArtifact {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as AuctionValuesArtifact;
  return typeof d.id === 'string' && Array.isArray(d.players) && d.schema_version >= 1;
}

export interface AuctionBoardProviderOptions {
  cache: ArtifactCache;
  bootstrap: Partial<Record<AuctionBoardId, AuctionValuesArtifact>>;
  now?: () => number;
  log?: (msg: string) => void;
}

export async function loadAuctionBoards(
  opts: AuctionBoardProviderOptions,
): Promise<LoadedAuctionBoards> {
  const now = (opts.now ?? Date.now)();
  const log = opts.log ?? console.warn;
  const boards: AuctionValuesArtifact[] = [];
  const sources: Partial<Record<AuctionBoardId, AuctionBoardSource>> = {};

  await Promise.all(
    AUCTION_BOARD_IDS.map(async (id) => {
      const key = AUCTION_BOARD_KEYS[id];
      const bootstrap = opts.bootstrap[id];
      const cached = await opts.cache.get(key);
      if (cached) {
        try {
          const doc = JSON.parse(cached.body) as unknown;
          if (isAuctionBoard(doc)) {
            const source: AuctionBoardSource = isFresh(cached.fetchedAt, now)
              ? 'cache'
              : 'stale_cache';
            if (source === 'stale_cache') {
              log(
                `[artifacts] auction ${id} cache older than 7d (fetchedAt=${cached.fetchedAt}); serving stale`,
              );
            }
            boards.push(doc);
            sources[id] = source;
            return;
          }
        } catch {
          log(`[artifacts] corrupt auction ${id} cache; falling back to bootstrap`);
        }
      }

      if (bootstrap && isAuctionBoard(bootstrap)) {
        if (!cached) {
          log(`[artifacts] auction ${id} missing from cache; using bundled bootstrap`);
        }
        boards.push(bootstrap);
        sources[id] = 'bootstrap';
        return;
      }

      log(`[artifacts] auction ${id} unavailable (no cache, no bootstrap)`);
    }),
  );

  return { boards, sources };
}

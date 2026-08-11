/**
 * Pluggable blob cache for sleeperMCP artifacts (R2 in Workers, FS in Node).
 */

export interface CachedArtifact {
  body: string;
  /** ISO timestamp used for the 7-day freshness check (upload/fetch time). */
  fetchedAt: string;
  generatedAt?: string;
}

export interface ArtifactCache {
  get(key: string): Promise<CachedArtifact | null>;
  put(key: string, value: CachedArtifact): Promise<void>;
}

/** Minimal R2-like bucket surface so Node tsc does not need worker types. */
export interface R2LikeBucket {
  get(key: string): Promise<{
    text(): Promise<string>;
    customMetadata?: Record<string, string>;
    /** R2 object upload time — set when GH Action puts objects. */
    uploaded?: Date;
  } | null>;
  put(
    key: string,
    value: string,
    options?: { customMetadata?: Record<string, string> },
  ): Promise<unknown>;
}

/** Cloudflare R2 binding adapter (Worker-safe — no node: imports). */
export function createR2ArtifactCache(bucket: R2LikeBucket): ArtifactCache {
  return {
    async get(key: string): Promise<CachedArtifact | null> {
      const obj = await bucket.get(key);
      if (!obj) return null;
      const body = await obj.text();
      const fetchedAt =
        obj.customMetadata?.['fetchedAt'] ||
        (obj.uploaded instanceof Date ? obj.uploaded.toISOString() : undefined) ||
        new Date(0).toISOString();
      const generatedAt = obj.customMetadata?.['generatedAt'] || undefined;
      return { body, fetchedAt, generatedAt };
    },
    async put(key: string, value: CachedArtifact): Promise<void> {
      await bucket.put(key, value.body, {
        customMetadata: {
          fetchedAt: value.fetchedAt,
          generatedAt: value.generatedAt ?? '',
        },
      });
    },
  };
}

import type { LoadedArtifacts } from './artifact-provider.js';

export type ArtifactSource = 'cache' | 'stale_cache' | 'bootstrap';

export interface ArtifactDocMeta {
  source: ArtifactSource;
  generatedAt: string | null;
}

export interface ArtifactsHealthMeta {
  factors: ArtifactDocMeta;
  benchmarks: ArtifactDocMeta;
}

function generatedAtOf(doc: { generated_at?: string | null }): string | null {
  const value = doc.generated_at;
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

export function artifactMetaFromLoaded(loaded: LoadedArtifacts): ArtifactsHealthMeta {
  return {
    factors: {
      source: loaded.factorsSource,
      generatedAt: generatedAtOf(loaded.factors),
    },
    benchmarks: {
      source: loaded.benchmarksSource,
      generatedAt: generatedAtOf(loaded.benchmarks),
    },
  };
}

export function bootstrapArtifactMeta(
  factors: { generated_at?: string | null },
  benchmarks: { generated_at?: string | null },
): ArtifactsHealthMeta {
  return {
    factors: { source: 'bootstrap', generatedAt: generatedAtOf(factors) },
    benchmarks: { source: 'bootstrap', generatedAt: generatedAtOf(benchmarks) },
  };
}

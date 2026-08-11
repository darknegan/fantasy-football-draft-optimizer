import type { Position, PositionBenchmarkConfig, ScoringVariant } from '@draftlab/domain';
import { BENCHMARKS_2025, getBenchmarkConfig, setActiveBenchmarks } from './benchmarks.js';

export type BenchmarkScoringKey = 'std' | 'half' | 'ppr';

export interface BenchmarksArtifactFactor {
  factor_id: string;
  source?: string | null;
  benchmark: Record<BenchmarkScoringKey, number | null> | null;
  note?: string | null;
}

export interface BenchmarksArtifact {
  schema_version: number;
  generated_at?: string;
  benchmarks: Partial<
    Record<
      Position,
      {
        factors: BenchmarksArtifactFactor[];
        computed?: number;
        total?: number;
      }
    >
  >;
}

const VARIANT_TO_KEY: Record<ScoringVariant, BenchmarkScoringKey> = {
  standard: 'std',
  half_ppr: 'half',
  ppr: 'ppr',
};

/**
 * Merge sleeperMCP ceilings into DraftLab factor metadata.
 * Metadata (label/category/direction/categorical/bands) stays local;
 * numeric `benchmark` values come from the artifact when present.
 */
export function mergeBenchmarkArtifact(
  artifact: BenchmarksArtifact,
  variant: ScoringVariant = 'half_ppr',
  base: Record<Position, PositionBenchmarkConfig> = BENCHMARKS_2025,
): Record<Position, PositionBenchmarkConfig> {
  const key = VARIANT_TO_KEY[variant];
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE'];
  const out = {} as Record<Position, PositionBenchmarkConfig>;

  for (const position of positions) {
    const template = base[position];
    const artifactFactors = artifact.benchmarks[position]?.factors ?? [];
    const byId = new Map(artifactFactors.map((f) => [f.factor_id, f]));

    out[position] = {
      ...template,
      factors: template.factors.map((factor) => {
        const hit = byId.get(factor.id);
        const value = hit?.benchmark?.[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          return { ...factor, benchmark: value };
        }
        return { ...factor };
      }),
    };
  }

  return out;
}

/** Apply artifact ceilings as the active runtime config. */
export function activateBenchmarkArtifact(
  artifact: BenchmarksArtifact,
  variant: ScoringVariant = 'half_ppr',
): Record<Position, PositionBenchmarkConfig> {
  const merged = mergeBenchmarkArtifact(artifact, variant);
  setActiveBenchmarks(merged);
  return merged;
}

export { getBenchmarkConfig };

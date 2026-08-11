import { describe, expect, it } from 'vitest';
import { artifactMetaFromLoaded } from '../artifact-meta.js';

describe('artifactMetaFromLoaded', () => {
  it('maps sources and generated_at', () => {
    const meta = artifactMetaFromLoaded({
      factors: { schema_version: 4, generated_at: '2026-08-11T14:30:05+00:00', players: [] },
      benchmarks: { schema_version: 2, generated_at: '2026-08-11T03:45:49+00:00' },
      factorsSource: 'cache',
      benchmarksSource: 'bootstrap',
    } as any);

    expect(meta).toEqual({
      factors: { source: 'cache', generatedAt: '2026-08-11T14:30:05+00:00' },
      benchmarks: { source: 'bootstrap', generatedAt: '2026-08-11T03:45:49+00:00' },
    });
  });

  it('uses null generatedAt when missing', () => {
    const meta = artifactMetaFromLoaded({
      factors: { schema_version: 4, generated_at: '', players: [] },
      benchmarks: { schema_version: 2 },
      factorsSource: 'bootstrap',
      benchmarksSource: 'bootstrap',
    } as any);

    expect(meta.factors.generatedAt).toBeNull();
    expect(meta.benchmarks.generatedAt).toBeNull();
  });
});

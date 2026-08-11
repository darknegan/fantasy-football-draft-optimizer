import { afterEach, describe, expect, it } from 'vitest';
import { getBenchmarkConfig, resetActiveBenchmarks } from '../config/benchmarks.js';
import {
  activateBenchmarkArtifact,
  mergeBenchmarkArtifact,
  type BenchmarksArtifact,
} from '../config/load-benchmarks.js';

const fixture: BenchmarksArtifact = {
  schema_version: 2,
  generated_at: '2026-01-01T00:00:00+00:00',
  benchmarks: {
    QB: {
      factors: [
        {
          factor_id: 'pass_attempts',
          benchmark: { std: 30, half: 31.5, ppr: 32 },
        },
      ],
    },
    RB: { factors: [] },
    WR: { factors: [] },
    TE: { factors: [] },
  },
};

afterEach(() => {
  resetActiveBenchmarks();
});

describe('mergeBenchmarkArtifact', () => {
  it('overwrites ceilings from the artifact for the scoring variant', () => {
    const merged = mergeBenchmarkArtifact(fixture, 'half_ppr');
    const passAtt = merged.QB.factors.find((f) => f.id === 'pass_attempts');
    expect(passAtt?.benchmark).toBe(31.5);
    expect(passAtt?.label).toBe('Pass attempts / g');
  });

  it('keeps metadata fallback when artifact has null for a factor', () => {
    const merged = mergeBenchmarkArtifact(fixture, 'half_ppr');
    const rushing = merged.QB.factors.find((f) => f.id === 'rushing_tds');
    expect(rushing?.benchmark).toBeGreaterThan(0);
  });
});

describe('activateBenchmarkArtifact', () => {
  it('updates getBenchmarkConfig runtime values', () => {
    activateBenchmarkArtifact(fixture, 'ppr');
    expect(getBenchmarkConfig('QB').factors.find((f) => f.id === 'pass_attempts')?.benchmark).toBe(
      32,
    );
  });
});

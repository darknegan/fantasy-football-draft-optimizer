import { describe, expect, it } from 'vitest';
import { formatArtifactGeneratedAt, formatArtifactLine, sourceLabel } from './artifact-provenance';

describe('artifact provenance formatting', () => {
  it('maps artifact sources to display labels', () => {
    expect(sourceLabel('cache')).toBe('R2');
    expect(sourceLabel('stale_cache')).toBe('R2 (stale)');
    expect(sourceLabel('bootstrap')).toBe('Bootstrap');
  });

  it('formats local time without a year', () => {
    const formatted = formatArtifactGeneratedAt('2026-08-11T14:30:05+00:00', 'en-US');

    expect(formatted).toMatch(/Aug/);
    expect(formatted).toMatch(/11/);
    expect(formatted).not.toMatch(/2026/);
  });

  it('builds a Factors line with source and date', () => {
    expect(
      formatArtifactLine(
        'Factors',
        { source: 'cache', generatedAt: '2026-08-11T14:30:05+00:00' },
        'en-US',
      ),
    ).toMatch(/^Factors · R2 · /);
  });

  it('omits the date when generatedAt is null', () => {
    expect(
      formatArtifactLine('Benchmarks', { source: 'bootstrap', generatedAt: null }, 'en-US'),
    ).toBe('Benchmarks · Bootstrap');
  });

  it('omits the date when generatedAt is invalid', () => {
    expect(
      formatArtifactLine('Factors', { source: 'stale_cache', generatedAt: 'not-a-date' }, 'en-US'),
    ).toBe('Factors · R2 (stale)');
  });
});

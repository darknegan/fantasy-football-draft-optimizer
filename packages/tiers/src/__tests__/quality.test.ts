import { describe, expect, it } from 'vitest';
import { qualityBand, QUALITY_THRESHOLDS } from '../quality.js';

describe('qualityBand', () => {
  it('assigns bands from absolute draftScore thresholds', () => {
    expect(qualityBand(92, 5)).toBe('S');
    expect(qualityBand(80, 5)).toBe('A');
    expect(qualityBand(65, 5)).toBe('B');
    expect(qualityBand(50, 5)).toBe('C');
    expect(qualityBand(20, 5)).toBe('D');
  });

  it('treats each threshold as inclusive', () => {
    expect(qualityBand(QUALITY_THRESHOLDS.S, 5)).toBe('S');
    expect(qualityBand(QUALITY_THRESHOLDS.S - 0.1, 5)).toBe('A');
    expect(qualityBand(QUALITY_THRESHOLDS.A, 5)).toBe('A');
    expect(qualityBand(QUALITY_THRESHOLDS.B, 5)).toBe('B');
    expect(qualityBand(QUALITY_THRESHOLDS.C, 5)).toBe('C');
    expect(qualityBand(QUALITY_THRESHOLDS.C - 0.1, 5)).toBe('D');
  });

  it('returns null for zero-known-factor players regardless of score', () => {
    // A mostly-generic draftScore is not a judgment — it must not earn a letter.
    expect(qualityBand(99, 0)).toBeNull();
    expect(qualityBand(10, 0)).toBeNull();
  });

  it('does not vary by pool — the same score always yields the same band', () => {
    const first = qualityBand(76, 3);
    const second = qualityBand(76, 12);
    expect(first).toBe(second);
  });
});

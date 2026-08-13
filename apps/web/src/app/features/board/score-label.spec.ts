import { describe, expect, it } from 'vitest';
import { scoreLabel } from './score-label';

function row(opts: { draftScore: number; contextualScore?: number }) {
  return {
    evaluation: { draftScore: opts.draftScore },
    recommendation:
      opts.contextualScore != null ? { contextualScore: opts.contextualScore } : undefined,
  };
}

describe('scoreLabel', () => {
  it('rounds contextualScore when present', () => {
    expect(scoreLabel(row({ draftScore: 70.4, contextualScore: 76.6 }))).toBe('77');
  });

  it('falls back to rounded draftScore when recommendation is missing', () => {
    expect(scoreLabel(row({ draftScore: 70.4 }))).toBe('70');
  });
});

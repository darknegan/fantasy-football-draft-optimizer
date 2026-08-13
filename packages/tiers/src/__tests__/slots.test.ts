import { describe, expect, it } from 'vitest';
import { PLANNING_ROUNDS, projectUserPickProgress, snakePickNumbers } from '../slots.js';

describe('snakePickNumbers', () => {
  it('returns the classic snake sequence for slot 3 in a 12-team draft', () => {
    expect(snakePickNumbers(3, 12, 3)).toEqual([3, 22, 27]);
  });

  it('defaults to PLANNING_ROUNDS', () => {
    expect(snakePickNumbers(1, 12).length).toBe(PLANNING_ROUNDS);
  });
});

describe('projectUserPickProgress', () => {
  it('treats the on-the-clock pick as the next user pick', () => {
    expect(projectUserPickProgress(1, 12, 1)).toEqual({ nextOverall: 1, picksUntilNext: 0 });
  });

  it('prefers draft.picksUntilUser when provided', () => {
    expect(projectUserPickProgress(6, 12, 61, 12)).toEqual({ nextOverall: 67, picksUntilNext: 12 });
  });

  it('returns null when the planning window is exhausted', () => {
    expect(projectUserPickProgress(1, 12, PLANNING_ROUNDS * 12 + 1, null, 15)).toBeNull();
  });
});

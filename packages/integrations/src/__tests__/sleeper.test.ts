import { describe, expect, it } from 'vitest';
import { nextPollIntervalMs } from '../sleeper/client.js';
import { SleeperRateLimiter } from '../sleeper/rate-limiter.js';
import { mapRosterPositions, mapScoring, mapDraftType } from '../sleeper/map-league.js';
import { summarizeScoring, isSuperflex } from '../sleeper/scoring-summary.js';

describe('SleeperRateLimiter', () => {
  it('allows bursts under the budget', async () => {
    const limiter = new SleeperRateLimiter({ maxPerWindow: 3, windowMs: 60_000 });
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.snapshot().callsInWindow).toBe(3);
    expect(limiter.delayMs()).toBeGreaterThan(0);
  });

  it('backs off on 429', () => {
    const limiter = new SleeperRateLimiter();
    limiter.record429();
    expect(limiter.delayMs()).toBeGreaterThan(0);
  });
});

describe('nextPollIntervalMs', () => {
  it('speeds up when user pick is near', () => {
    expect(
      nextPollIntervalMs({ draftStatus: 'drafting', picksUntilUser: 2, consecutiveUnchanged: 0 }),
    ).toBe(2_000);
  });

  it('stops when complete', () => {
    expect(nextPollIntervalMs({ draftStatus: 'complete', consecutiveUnchanged: 0 })).toBe(0);
  });

  it('slows when degraded', () => {
    expect(nextPollIntervalMs({ draftStatus: 'drafting', consecutiveUnchanged: 0, degraded: true })).toBe(
      30_000,
    );
  });
});

describe('map helpers', () => {
  it('detects superflex roster', () => {
    const roster = mapRosterPositions(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN']);
    expect(roster.superflex).toBe(1);
    expect(isSuperflex(roster)).toBe(true);
  });

  it('maps TE premium scoring', () => {
    const scoring = mapScoring({ rec: 1, bonus_rec_te: 0.5, pass_td: 4 });
    expect(scoring.tePremiumBonus).toBe(0.5);
    expect(scoring.variant).toBe('ppr');
  });

  it('maps draft types', () => {
    expect(mapDraftType('auction')).toBe('auction');
    expect(mapDraftType('snake')).toBe('snake');
  });
});

describe('scoring summary', () => {
  it('warns on superflex', () => {
    const scoring = mapScoring({ rec: 1, pass_td: 4 });
    const roster = mapRosterPositions(['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX']);
    const summary = summarizeScoring(scoring, roster);
    expect(summary.superflex).toBe(true);
    expect(summary.warnings.some((w) => w.includes('Superflex'))).toBe(true);
    expect(summary.plainLanguage.join(' ')).toMatch(/PPR/i);
  });
});

import { describe, expect, it } from 'vitest';
import { nextPollIntervalMs } from '../sleeper/client.js';
import { mapWeeklyGameLog } from '../sleeper/game-log.js';
import { sleeperHeadshotThumbUrl, sleeperHeadshotUrl } from '../sleeper/headshot.js';
import { SleeperRateLimiter } from '../sleeper/rate-limiter.js';
import { mapRosterPositions, mapScoring, mapDraftType, mapDraftPlayerPool, mapDraftRounds, mapLeagueType, selectSleeperDraft } from '../sleeper/map-league.js';
import type { SleeperDraft } from '../sleeper/client.js';
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

  it('maps Sleeper league type codes', () => {
    expect(mapLeagueType({ type: 0 })).toBe('redraft');
    expect(mapLeagueType({ type: 1 })).toBe('redraft');
    expect(mapLeagueType({ type: 2 })).toBe('dynasty');
    expect(mapLeagueType({ type: '2' })).toBe('dynasty');
    expect(mapLeagueType({ type: 'dynasty' })).toBe('dynasty');
    expect(mapLeagueType({ type: 2, disable_adds: 1 })).toBe('dynasty');
    expect(mapLeagueType({ disable_adds: 1 })).toBe('redraft');
  });

  it('maps draft player pool from Sleeper player_type', () => {
    expect(mapDraftPlayerPool({ settings: { player_type: 1 } } as SleeperDraft, 'dynasty')).toBe(
      'rookies',
    );
    expect(mapDraftPlayerPool({ settings: { player_type: 0 } } as SleeperDraft, 'dynasty')).toBe(
      'all',
    );
    expect(mapDraftPlayerPool(null, 'dynasty')).toBe('rookies');
    expect(mapDraftPlayerPool(null, 'redraft')).toBe('all');
  });

  it('maps draft rounds from Sleeper settings', () => {
    expect(mapDraftRounds({ settings: { rounds: 3 } } as SleeperDraft, 'dynasty')).toBe(3);
    expect(mapDraftRounds(null, 'dynasty')).toBe(4);
    expect(mapDraftRounds(null, 'redraft')).toBe(16);
  });

  it('selects active rookie draft for dynasty leagues', () => {
    const drafts = [
      {
        draft_id: 'startup',
        status: 'complete',
        season: '2025',
        settings: { player_type: 0, rounds: 21 },
      },
      {
        draft_id: 'rookie',
        status: 'pre_draft',
        season: '2026',
        settings: { player_type: 1, rounds: 3 },
      },
    ] as SleeperDraft[];
    const picked = selectSleeperDraft(drafts, 'dynasty', 2026);
    expect(picked?.draft_id).toBe('rookie');
  });
});

describe('scoring summary', () => {
  it('warns on superflex', () => {
    const scoring = mapScoring({ rec: 1, pass_td: 4 });
    const roster = mapRosterPositions(['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX']);
    const summary = summarizeScoring(scoring, roster);
    expect(summary.superflex).toBe(true);
    expect(summary.formatNotes.some((n) => n.includes('Superflex'))).toBe(true);
    expect(summary.warnings).toEqual([]);
    expect(summary.plainLanguage.join(' ')).toMatch(/PPR/i);
  });
});

describe('headshots', () => {
  it('builds CDN urls from sleeper id', () => {
    expect(sleeperHeadshotUrl('6797')).toBe(
      'https://sleepercdn.com/content/nfl/players/6797.jpg',
    );
    expect(sleeperHeadshotThumbUrl('6797')).toBe(
      'https://sleepercdn.com/content/nfl/players/thumb/6797.jpg',
    );
  });
});

describe('mapWeeklyGameLog', () => {
  it('normalizes weekly rows with snap pct and tones', () => {
    const log = mapWeeklyGameLog({
      sleeperId: '4046',
      season: 2024,
      seasonType: 'regular',
      scoring: 'ppr',
      weekly: {
        '1': {
          week: 1,
          opponent: 'BAL',
          is_away_team: false,
          team: 'KC',
          date: '2024-09-05',
          stats: {
            pts_ppr: 16.14,
            off_snp: 54,
            tm_off_snp: 54,
            pos_rank_ppr: 12,
            pass_att: 28,
            pass_cmp: 20,
            pass_yd: 291,
            pass_td: 1,
            pass_int: 1,
            rush_att: 2,
            rush_yd: 3,
            rush_td: 0,
          },
        },
        '2': {
          week: 2,
          opponent: 'CIN',
          is_away_team: true,
          team: 'KC',
          stats: {
            pts_ppr: 28.5,
            off_snp: 60,
            tm_off_snp: 65,
            pos_rank_ppr: 3,
            pass_att: 35,
            pass_cmp: 26,
            pass_yd: 320,
            pass_td: 3,
            pass_int: 0,
            rush_att: 4,
            rush_yd: 25,
            rush_td: 0,
          },
        },
      },
      seasonTotals: {
        week: null,
        stats: {
          gp: 2,
          pts_ppr: 44.64,
          off_snp: 114,
          tm_off_snp: 119,
          pos_rank_ppr: 8,
          pass_att: 63,
          pass_cmp: 46,
          pass_yd: 611,
          pass_td: 4,
          pass_int: 1,
          rush_att: 6,
          rush_yd: 28,
          rush_td: 0,
        },
      },
    });

    expect(log.weeks).toHaveLength(2);
    expect(log.weeks[0]?.opponent).toBe('BAL');
    expect(log.weeks[0]?.snapPct).toBe(100);
    expect(log.weeks[1]?.isAway).toBe(true);
    expect(log.weeks[1]?.snapPct).toBe(92.3);
    expect(log.weeks[1]?.tone).toBe('good');
    expect(log.totals?.games).toBe(2);
    expect(log.totals?.passing.td).toBe(4);
  });

  it('labels postseason weeks', () => {
    const log = mapWeeklyGameLog({
      sleeperId: '6797',
      season: 2025,
      seasonType: 'post',
      weekly: {
        '1': {
          week: 1,
          opponent: 'NE',
          stats: { pts_ppr: 20, pass_att: 30, pass_cmp: 20, pass_yd: 250, pass_td: 2 },
        },
      },
    });
    expect(log.weeks[0]?.label).toBe('WC');
  });

  it('skips null bye-week entries', () => {
    const log = mapWeeklyGameLog({
      sleeperId: '4046',
      season: 2025,
      seasonType: 'regular',
      weekly: {
        '1': { week: 1, opponent: 'LAC', stats: { pts_ppr: 12, pass_att: 30 } },
        '10': null,
      },
    });
    expect(log.weeks).toHaveLength(1);
    expect(log.weeks[0]?.week).toBe(1);
  });
});

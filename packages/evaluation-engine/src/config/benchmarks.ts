import type { PositionBenchmarkConfig } from '@draftlab/domain';
import { DEFAULT_GRADING_BANDS } from './grade-weights.js';

/**
 * Versioned per-position factor benchmarks.
 * Adding RB later is a config change — see docs/01-player-evaluation-model.md §1.5.1.
 */
export const BENCHMARKS_2025: Record<'QB' | 'WR' | 'TE' | 'RB', PositionBenchmarkConfig> = {
  QB: {
    position: 'QB',
    season: 2025,
    bands: { ...DEFAULT_GRADING_BANDS },
    factors: [
      {
        id: 'pass_attempts',
        label: 'Pass attempts / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 33.91,
      },
      {
        id: 'passing_tds',
        label: 'Passing TDs / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 2.63,
      },
      {
        id: 'rush_attempts',
        label: 'Rush attempts / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 5.74,
      },
      {
        id: 'rushing_tds',
        label: 'Rushing TDs / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 0.32,
      },
      {
        id: 'off_ppg_rank',
        label: 'Offensive PPG rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 6.35,
      },
      {
        id: 'ol_pass_block_rank',
        label: 'OL pass block rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 11.54,
      },
      {
        // sleeperMCP now sources this from nflverse play-by-play (top-3 QB
        // cohort, 11-season mean, relative SE 2.1% -- tight). Was a 4.31
        // placeholder with no per-player values behind it; real values only
        // landed once build_benchmarks.py's pbp pipeline existed.
        id: 'deep_ball_attempts',
        label: 'Deep ball attempts / g',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 4.397,
      },
      {
        id: 'qbr_rank',
        label: 'QBR rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 6.9,
      },
      {
        // sleeperMCP-computed, same pbp cohort method as deep_ball_attempts
        // above (relative SE 4%).
        id: 'red_zone_attempts',
        label: 'Red zone combined attempts',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 6.848,
      },
      {
        id: 'adp',
        label: 'ADP rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 8.22,
      },
      {
        // sleeperMCP-computed, same pbp cohort method as deep_ball_attempts
        // above (relative SE 6.7%).
        id: 'neutral_pace_rank',
        label: 'Neutral pace rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 12.697,
      },
      {
        id: 'pass_dvoa_rank',
        label: 'Pass offense DVOA rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 7.01,
      },
    ],
  },
  WR: {
    position: 'WR',
    season: 2025,
    bands: { ...DEFAULT_GRADING_BANDS },
    factors: [
      {
        id: 'targets',
        label: 'Targets / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 10.7,
      },
      {
        id: 'receptions',
        label: 'Receptions / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 7.21,
      },
      {
        id: 'touchdowns',
        label: 'Touchdowns / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 0.76,
      },
      {
        id: 'off_ppg_rank',
        label: 'Offensive PPG rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 8.94,
      },
      {
        id: 'qb_pff_rank',
        label: 'QB PFF pass grade rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 10.36,
      },
      {
        id: 'team_pass_attempts',
        label: 'Team pass attempts',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 594.94,
      },
      {
        id: 'secondary_target',
        label: 'Highest targeted secondary option',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 103.31,
        categorical: 'secondaryTargetCompetition',
      },
      {
        id: 'ol_pass_block_rank',
        label: 'OL pass block rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 10.75,
      },
      {
        id: 'yprr',
        label: 'Yards per route run',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 4.81,
      },
      {
        id: 'reception_perception',
        label: 'Reception Perception percentile',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 90,
      },
      {
        id: 'archetype',
        label: 'Archetype',
        category: 'profile',
        direction: 'higherBetter',
        benchmark: 1,
        categorical: 'archetypeGrade',
      },
      {
        id: 'injury_concern',
        label: 'Injury/Suspension Concern',
        category: 'profile',
        direction: 'lowerBetter',
        benchmark: 1,
        categorical: 'injuryConcern',
      },
    ],
  },
  TE: {
    position: 'TE',
    season: 2025,
    bands: { ...DEFAULT_GRADING_BANDS },
    factors: [
      {
        id: 'targets',
        label: 'Targets / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 8.1,
      },
      {
        id: 'receptions',
        label: 'Receptions / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 5.71,
      },
      {
        id: 'touchdowns',
        label: 'Touchdowns / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 0.56,
      },
      {
        id: 'off_ppg_rank',
        label: 'Offensive PPG rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 11.78,
      },
      {
        id: 'qb_qbr_rank',
        label: 'QB QBR rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 9.7,
      },
      {
        id: 'team_pass_att_rank',
        label: 'Team pass attempts rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 11.81,
      },
      {
        id: 'team_target_rank',
        label: 'Team targets rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 1.43,
      },
      {
        id: 'rec_td_rank',
        label: 'Receiving TD rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 1.38,
      },
      {
        id: 'route_participation',
        label: 'Route participation %',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 79.8,
      },
      {
        id: 'inline_pct',
        label: 'In-line %',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 39.0,
      },
      {
        id: 'yprr_rank',
        label: 'YPRR rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 5.14,
      },
      {
        id: 'injury_concern',
        label: 'Injury/Age Concern',
        category: 'profile',
        direction: 'lowerBetter',
        benchmark: 1,
        categorical: 'injuryConcern',
      },
    ],
  },
  RB: {
    position: 'RB',
    season: 2025,
    // No longer provisional. rz_touch_share, gl_carry_share, and neutral_run_rate are
    // still unsourced (benchmark 0, gradeByRatio's honest 'unknown' — same graceful
    // degradation QB/WR/TE already rely on for their own unlicensed factors: QB has
    // 3 unsourced nflverse:pbp factors, WR has 4 licensed:PFF ones, TE has 3. RB is no
    // longer a special case — 6/12 factors are real nflverse data (the best-sourced
    // position of the four; QB and WR are 5/12), so it gets the same partial-coverage
    // treatment they've always had rather than an all-or-nothing gate. See
    // docs/01-player-evaluation-model.md §1.5 for why that gate existed in the first
    // place: it was never about RB specifically, it was that every RB factor was
    // fabricated. That stopped being true once real benchmarks landed.
    bands: { ...DEFAULT_GRADING_BANDS },
    // Benchmarks sourced from FSE's "40 league winners since 2013" video analysis
    // (20+ PPR ppg, 12+ games, averaged across those seasons).
    factors: [
      {
        id: 'touches',
        label: 'Touches / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 21.5,
      },
      {
        id: 'rush_attempts',
        label: 'Rush attempts / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 17.3,
      },
      {
        id: 'targets',
        label: 'Targets / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 5.4,
      },
      {
        id: 'receptions',
        label: 'Receptions / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 4.25,
      },
      {
        id: 'touchdowns',
        label: 'Touchdowns / g',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 0.98,
      },
      {
        id: 'off_ppg_rank',
        label: 'Offensive PPG rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 9.5,
      },
      // Video labels this "PFF Run Blocking Grade" but the values behave like a 1-32
      // rank, not a 0-100 grade — confirm against the raw PFF field before trusting this.
      {
        id: 'ol_run_block_rank',
        label: 'OL run block rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 9.9,
      },
      {
        id: 'yards_per_carry',
        label: 'Yards per carry',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 4.89,
      },
      {
        id: 'yards_per_touch',
        label: 'Yards per touch',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 5.82,
      },
      {
        id: 'team_wins',
        label: 'Team wins',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 9.85,
      },
      // No video data — nflverse (get_player_stats / get_snap_counts per sleeperMCP
      // HANDOFF.md) is the intended source for these, not this benchmark.
      {
        id: 'rz_touch_share',
        label: 'Red zone touch share',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 0,
      },
      {
        id: 'snap_share',
        label: 'Snap share',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 0.717,
      },
      {
        id: 'gl_carry_share',
        label: 'Goal-line carry share',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 0,
      },
      {
        id: 'neutral_run_rate',
        label: 'Neutral run rate',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 0,
      },
      {
        id: 'archetype',
        label: 'Archetype',
        category: 'profile',
        direction: 'higherBetter',
        benchmark: 1,
        categorical: 'archetypeGrade',
      },
      {
        id: 'injury_concern',
        label: 'Injury Concern',
        category: 'profile',
        direction: 'lowerBetter',
        benchmark: 1,
        categorical: 'injuryConcern',
      },
    ],
  },
};

export function getBenchmarkConfig(
  position: 'QB' | 'WR' | 'TE' | 'RB',
  season = 2025,
): PositionBenchmarkConfig {
  if (season !== 2025) {
    // Future seasons can version independently; fall back to latest for now.
    return BENCHMARKS_2025[position];
  }
  return BENCHMARKS_2025[position];
}

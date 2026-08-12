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
        label: 'OL pass block rank (proxy)',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 11.485,
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
        id: 'yards_per_catch',
        label: 'Yards per catch',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 13.772,
      },
      {
        id: 'yac_per_reception',
        label: 'YAC per reception',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 4.773,
      },
      {
        id: 'target_share',
        label: 'Target share',
        category: 'volume',
        direction: 'higherBetter',
        benchmark: 0.299,
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
        label: 'QB QBR rank (proxy)',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 21.545,
      },
      {
        id: 'team_pass_attempts',
        label: 'Team pass attempts',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 594.94,
      },
      {
        id: 'route_participation',
        label: 'Route participation %',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 90.781,
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
        label: 'OL pass block rank (proxy)',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 13.697,
      },
      {
        id: 'neutral_pace_rank',
        label: 'Neutral pace rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 15.727,
      },
      {
        id: 'yprr',
        label: 'Yards per route run (proxy)',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 2.739,
      },
      {
        id: 'reception_perception',
        label: 'Catch % (NGS proxy)',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 68.864,
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
        id: 'ol_pass_block_rank',
        label: 'OL pass block rank (proxy)',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 14.667,
      },
      {
        id: 'neutral_pace_rank',
        label: 'Neutral pace rank',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 14.667,
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
    // sourced from sleeperMCP nflverse play-by-play (top-3 cohort, 11-season half-PPR
    // means; relative SE 2.0–3.5%). receptions, YPC, YPT, and team_wins are
    // sourced from sleeperMCP nflverse (ITEM-004).
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
        benchmark: 3.874,
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
      {
        id: 'ol_run_block_rank',
        label: 'OL run block rank (proxy)',
        category: 'situational',
        direction: 'lowerBetter',
        benchmark: 12.97,
      },
      {
        id: 'yards_per_carry',
        label: 'Yards per carry',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 4.859,
      },
      {
        id: 'yards_per_touch',
        label: 'Yards per touch',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 5.606,
      },
      {
        id: 'team_wins',
        label: 'Team wins',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 9.848,
      },
      // sleeperMCP-computed from nflverse play-by-play (top-3 RB cohort,
      // 11-season half-PPR means). Was benchmark: 0 until ITEM-001 / TDD-001.
      {
        id: 'rz_touch_share',
        label: 'Red zone touch share',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 0.4,
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
        benchmark: 0.664,
      },
      {
        id: 'neutral_run_rate',
        label: 'Neutral run rate',
        category: 'situational',
        direction: 'higherBetter',
        benchmark: 0.435,
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

/**
 * Static metadata + last-known ceilings. Prefer numbers from sleeperMCP
 * `benchmarks.json` via `activateBenchmarkArtifact` / `setActiveBenchmarks`.
 * These embedded values remain the offline bootstrap / test fallback only.
 */
let activeBenchmarks: Record<'QB' | 'WR' | 'TE' | 'RB', PositionBenchmarkConfig> =
  BENCHMARKS_2025;

export function setActiveBenchmarks(
  next: Record<'QB' | 'WR' | 'TE' | 'RB', PositionBenchmarkConfig>,
): void {
  activeBenchmarks = next;
}

export function resetActiveBenchmarks(): void {
  activeBenchmarks = BENCHMARKS_2025;
}

export function getBenchmarkConfig(
  position: 'QB' | 'WR' | 'TE' | 'RB',
  season = 2025,
): PositionBenchmarkConfig {
  if (season !== 2025) {
    // Future seasons can version independently; fall back to latest for now.
    return activeBenchmarks[position] ?? BENCHMARKS_2025[position];
  }
  return activeBenchmarks[position];
}

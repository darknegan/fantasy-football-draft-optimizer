/**
 * Normalize Sleeper's undocumented weekly/season stats payloads into a UI-friendly
 * game-log DTO. Stat field names mirror what the Sleeper app Game Log tab shows.
 */

export type GameLogTone = 'good' | 'avg' | 'bad' | 'neutral';
export type ScoringVariant = 'ppr' | 'half_ppr' | 'std';

export interface SleeperWeekStatRow {
  week?: number | null;
  season?: string | number;
  season_type?: string;
  team?: string | null;
  opponent?: string | null;
  is_away_team?: boolean;
  date?: string | null;
  player_id?: string;
  stats?: Record<string, number | null | undefined>;
  status?: string | null;
  player?: {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string | null;
    years_exp?: number;
    injury_status?: string | null;
    number?: number | string;
  };
}

export interface GameLogPassing {
  att: number | null;
  cmp: number | null;
  yd: number | null;
  td: number | null;
  int: number | null;
}

export interface GameLogRushing {
  att: number | null;
  yd: number | null;
  ypc: number | null;
  td: number | null;
}

export interface GameLogReceiving {
  tgt: number | null;
  rec: number | null;
  yd: number | null;
  td: number | null;
}

export interface GameLogWeek {
  week: number;
  label: string;
  opponent: string | null;
  isAway: boolean;
  team: string | null;
  date: string | null;
  fpts: number | null;
  snapPct: number | null;
  rank: number | null;
  passing: GameLogPassing;
  rushing: GameLogRushing;
  receiving: GameLogReceiving;
  /** Relative performance vs the season median fantasy points for this player. */
  tone: GameLogTone;
}

export interface GameLogSeasonTotals {
  games: number;
  fpts: number | null;
  fptsPerGame: number | null;
  snapPct: number | null;
  rank: number | null;
  passing: GameLogPassing;
  rushing: GameLogRushing;
  receiving: GameLogReceiving;
}

export interface PlayerGameLog {
  sleeperId: string;
  season: number;
  seasonType: string;
  scoring: ScoringVariant;
  weeks: GameLogWeek[];
  totals: GameLogSeasonTotals | null;
  source: 'sleeper';
}

function num(stats: Record<string, number | null | undefined> | undefined, key: string): number | null {
  const v = stats?.[key];
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

function round1(n: number | null): number | null {
  if (n == null) return null;
  return Math.round(n * 10) / 10;
}

function round2(n: number | null): number | null {
  if (n == null) return null;
  return Math.round(n * 100) / 100;
}

function ptsKey(scoring: ScoringVariant): string {
  if (scoring === 'std') return 'pts_std';
  if (scoring === 'half_ppr') return 'pts_half_ppr';
  return 'pts_ppr';
}

function rankKey(scoring: ScoringVariant): string {
  if (scoring === 'std') return 'pos_rank_std';
  if (scoring === 'half_ppr') return 'pos_rank_half_ppr';
  return 'pos_rank_ppr';
}

function snapPct(stats: Record<string, number | null | undefined> | undefined): number | null {
  const off = num(stats, 'off_snp');
  const tm = num(stats, 'tm_off_snp');
  if (off == null || tm == null || tm <= 0) return null;
  return Math.round((off / tm) * 1000) / 10;
}

function passing(stats: Record<string, number | null | undefined> | undefined): GameLogPassing {
  return {
    att: num(stats, 'pass_att'),
    cmp: num(stats, 'pass_cmp'),
    yd: num(stats, 'pass_yd'),
    td: num(stats, 'pass_td'),
    int: num(stats, 'pass_int'),
  };
}

function rushing(stats: Record<string, number | null | undefined> | undefined): GameLogRushing {
  const att = num(stats, 'rush_att');
  const yd = num(stats, 'rush_yd');
  const ypc = num(stats, 'rush_ypa') ?? (att && yd != null && att > 0 ? yd / att : null);
  return {
    att,
    yd,
    ypc: round2(ypc),
    td: num(stats, 'rush_td'),
  };
}

function receiving(stats: Record<string, number | null | undefined> | undefined): GameLogReceiving {
  return {
    tgt: num(stats, 'rec_tgt'),
    rec: num(stats, 'rec'),
    yd: num(stats, 'rec_yd'),
    td: num(stats, 'rec_td'),
  };
}

function weekLabel(week: number, seasonType: string): string {
  if (seasonType === 'post') {
    // Sleeper post weeks are typically 1=WC, 2=DIV, 3=CON, 4=SB
    const labels = ['WC', 'DIV', 'CON', 'SB'];
    return labels[week - 1] ?? `P${week}`;
  }
  return String(week);
}

function toneFor(fpts: number | null, median: number | null): GameLogTone {
  if (fpts == null) return 'neutral';
  if (median == null || median <= 0) {
    if (fpts >= 20) return 'good';
    if (fpts <= 8) return 'bad';
    return 'avg';
  }
  if (fpts >= median * 1.25) return 'good';
  if (fpts <= median * 0.7) return 'bad';
  return 'avg';
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? null;
}

/** Weekly payload is a map of week → row (keys are string week numbers). */
export function mapWeeklyGameLog(opts: {
  sleeperId: string;
  season: number;
  seasonType: string;
  scoring?: ScoringVariant;
  weekly: Record<string, SleeperWeekStatRow> | SleeperWeekStatRow[] | null | undefined;
  seasonTotals?: SleeperWeekStatRow | null;
}): PlayerGameLog {
  const scoring = opts.scoring ?? 'ppr';
  const rows: SleeperWeekStatRow[] = Array.isArray(opts.weekly)
    ? opts.weekly
    : opts.weekly
      ? Object.values(opts.weekly)
      : [];

  const prelim = rows
    .filter((r) => r.week != null && Number(r.week) > 0)
    .map((r) => {
      const week = Number(r.week);
      const stats = r.stats ?? {};
      const fpts = round2(num(stats, ptsKey(scoring)));
      return { r, week, stats, fpts };
    })
    .sort((a, b) => a.week - b.week);

  const med = median(prelim.map((p) => p.fpts).filter((v): v is number => v != null));

  const weeks: GameLogWeek[] = prelim.map(({ r, week, stats, fpts }) => ({
    week,
    label: weekLabel(week, opts.seasonType),
    opponent: r.opponent ?? null,
    isAway: !!r.is_away_team,
    team: r.team ?? null,
    date: r.date ?? null,
    fpts,
    snapPct: snapPct(stats),
    rank: num(stats, rankKey(scoring)),
    passing: passing(stats),
    rushing: rushing(stats),
    receiving: receiving(stats),
    tone: toneFor(fpts, med),
  }));

  let totals: GameLogSeasonTotals | null = null;
  if (opts.seasonTotals?.stats) {
    const stats = opts.seasonTotals.stats;
    const fpts = round2(num(stats, ptsKey(scoring)));
    const games = num(stats, 'gp') ?? weeks.filter((w) => w.fpts != null).length;
    totals = {
      games,
      fpts,
      fptsPerGame: games > 0 && fpts != null ? round2(fpts / games) : null,
      snapPct: snapPct(stats),
      rank: num(stats, rankKey(scoring)),
      passing: passing(stats),
      rushing: rushing(stats),
      receiving: receiving(stats),
    };
  } else if (weeks.length) {
    const scored = weeks.filter((w) => w.fpts != null);
    const fptsSum = scored.reduce((s, w) => s + (w.fpts ?? 0), 0);
    const fpts = scored.length ? round2(fptsSum) : null;
    totals = {
      games: scored.length,
      fpts,
      fptsPerGame: scored.length && fpts != null ? round2(fpts / scored.length) : null,
      snapPct: null,
      rank: null,
      passing: {
        att: sumField(weeks, (w) => w.passing.att),
        cmp: sumField(weeks, (w) => w.passing.cmp),
        yd: sumField(weeks, (w) => w.passing.yd),
        td: sumField(weeks, (w) => w.passing.td),
        int: sumField(weeks, (w) => w.passing.int),
      },
      rushing: {
        att: sumField(weeks, (w) => w.rushing.att),
        yd: sumField(weeks, (w) => w.rushing.yd),
        ypc: null,
        td: sumField(weeks, (w) => w.rushing.td),
      },
      receiving: {
        tgt: sumField(weeks, (w) => w.receiving.tgt),
        rec: sumField(weeks, (w) => w.receiving.rec),
        yd: sumField(weeks, (w) => w.receiving.yd),
        td: sumField(weeks, (w) => w.receiving.td),
      },
    };
    if (totals.rushing.att && totals.rushing.yd != null && totals.rushing.att > 0) {
      totals.rushing.ypc = round2(totals.rushing.yd / totals.rushing.att);
    }
  }

  return {
    sleeperId: opts.sleeperId,
    season: opts.season,
    seasonType: opts.seasonType,
    scoring,
    weeks,
    totals,
    source: 'sleeper',
  };
}

function sumField(weeks: GameLogWeek[], pick: (w: GameLogWeek) => number | null): number | null {
  let any = false;
  let sum = 0;
  for (const w of weeks) {
    const v = pick(w);
    if (v != null) {
      any = true;
      sum += v;
    }
  }
  return any ? round1(sum) : null;
}

export { round1, round2 };

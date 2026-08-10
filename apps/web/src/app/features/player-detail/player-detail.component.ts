import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type {
  FactorGrade,
  GradedFactor,
  League,
  Player,
  PlayerEvaluation,
  Position,
} from '../../core/api.types';

type FactorCategory = 'volume' | 'situational' | 'profile';

interface FactorGroup {
  category: FactorCategory;
  label: string;
  hint: string;
  factors: GradedFactor[];
}

interface TeCheck {
  key: string;
  label: string;
  valueLabel: string;
  passed: boolean;
}

interface InjurySeason {
  year: number;
  missed: number;
  tone: 'good' | 'warn' | 'bad';
}

interface MetricCard {
  label: string;
  value: string;
  unit: string;
  sub: string;
  tone: 'good' | 'accent' | 'warn' | 'bad' | 'muted';
}

const CATEGORY_META: Record<FactorCategory, { label: string; hint: string }> = {
  volume: { label: 'VOLUME', hint: 'per game' },
  situational: { label: 'SITUATIONAL', hint: 'team and role context' },
  profile: { label: 'PROFILE', hint: 'durability and age' },
};

const PCT_FACTORS = new Set(['route_participation', 'inline_pct', 'snap_share']);
const RANK_FACTORS = new Set([
  'off_ppg_rank',
  'qb_qbr_rank',
  'team_pass_att_rank',
  'team_target_rank',
  'rec_td_rank',
  'yprr_rank',
  'ol_pass_block_rank',
  'qbr_rank',
  'neutral_pace_rank',
  'pass_dvoa_rank',
]);

const INJURY_LABELS: Record<FactorGrade, string> = {
  green: 'Minimal',
  yellow: 'Some concern',
  orange: 'Concerned',
  red: 'Serious',
  unknown: '—',
};

const GRADE_GLYPH: Record<FactorGrade, string> = {
  green: '▲',
  yellow: '▬',
  orange: '▼',
  red: '▼',
  unknown: '?',
};

const GRADE_WEIGHT_LABEL: Record<FactorGrade, string> = {
  green: '+5',
  yellow: '+3',
  orange: '−1',
  red: '−3',
  unknown: '0',
};

const POS_BENCH_LABEL: Record<Position, string> = {
  QB: 'league-winning quarterbacks',
  RB: 'league-winning running backs',
  WR: 'league-winning wide receivers',
  TE: 'league-winning tight ends',
};

@Component({
  selector: 'app-player-detail',
  imports: [RouterLink],
  templateUrl: './player-detail.component.html',
  styleUrl: './player-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  leagueId = '';
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly player = signal<Player | null>(null);
  readonly evaluation = signal<PlayerEvaluation | null>(null);
  readonly league = signal<League | null>(null);
  readonly isTarget = signal(false);
  readonly flagBusy = signal(false);

  readonly factorGroups = computed(() => {
    const factors = this.evaluation()?.ceiling.factors ?? [];
    return this.groupFactors(factors);
  });

  readonly metrics = computed((): MetricCard[] => {
    const e = this.evaluation();
    if (!e) return [];
    return this.buildMetrics(e);
  });

  readonly teChecks = computed((): TeCheck[] => {
    const e = this.evaluation();
    const p = this.player();
    if (!e || !p || p.position !== 'TE') return [];
    return this.buildTeChecks(e.ceiling.factors ?? []);
  });

  readonly tePassedCount = computed(() => this.teChecks().filter((c) => c.passed).length);

  readonly injurySeasons = computed((): InjurySeason[] => {
    const e = this.evaluation();
    const p = this.player();
    if (!e || !p) return [];
    return this.buildInjurySeasons(e, p);
  });

  readonly injurySummary = computed(() => {
    const seasons = this.injurySeasons();
    if (!seasons.length) return '';
    const total = seasons.reduce((sum, s) => sum + s.missed, 0);
    if (total === 0) return `No games missed in ${seasons.length} seasons`;
    return `${total} games missed across ${seasons.length} seasons`;
  });

  readonly weightedBreakdown = computed(() => {
    const factors = this.evaluation()?.ceiling.factors ?? [];
    return this.formatWeightedBreakdown(factors);
  });

  readonly marketNarrative = computed(() => {
    const e = this.evaluation();
    if (!e) return '';
    return this.buildMarketNarrative(e);
  });

  readonly marketDiffValue = computed((): number | null => {
    const e = this.evaluation();
    return e ? this.marketDiffFromEval(e) : null;
  });

  readonly knownChip = computed(() => {
    const e = this.evaluation();
    if (!e) return '';
    const known = e.ceiling.knownFactors;
    const total = e.ceiling.factors?.length || 12;
    return `${known} of ${total} known`;
  });

  readonly benchHint = computed(() => {
    const pos = this.player()?.position;
    if (!pos) return '';
    return `Benchmarks are the average profile of ${POS_BENCH_LABEL[pos]}`;
  });

  ngOnInit(): void {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    const pid = this.route.snapshot.paramMap.get('pid');
    if (!pid) {
      this.error.set('Missing player id.');
      this.loading.set(false);
      return;
    }

    forkJoin({
      detail: this.api.player(pid).pipe(
        catchError((err: Error) => {
          this.error.set(err.message || 'Failed to load player.');
          return of(null);
        }),
      ),
      board: this.leagueId
        ? this.api.board(this.leagueId).pipe(catchError(() => of([])))
        : of([]),
      league: this.leagueId
        ? this.api.league(this.leagueId).pipe(catchError(() => of(null)))
        : of(null),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ detail, board, league }) => {
        this.loading.set(false);
        this.league.set(league);
        if (!detail) return;
        this.player.set(detail.player);
        this.evaluation.set(detail.evaluation);
        const row = board.find((r) => r.player.id === detail.player.id);
        this.isTarget.set(!!row?.target);
      });
  }

  toggleTarget(): void {
    const p = this.player();
    if (!p || !this.leagueId || this.flagBusy()) return;
    const next = !this.isTarget();
    this.flagBusy.set(true);
    this.api
      .setFlag(this.leagueId, p.id, 'target', next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isTarget.set(next);
          this.flagBusy.set(false);
        },
        error: () => this.flagBusy.set(false),
      });
  }

  gradeClass(grade: FactorGrade): string {
    return `grade-${grade}`;
  }

  gradeLabel(grade: FactorGrade): string {
    return `${GRADE_GLYPH[grade]} ${GRADE_WEIGHT_LABEL[grade]}`;
  }

  formatFactorValue(factor: GradedFactor, kind: 'value' | 'benchmark'): string {
    if (factor.factorId === 'injury_concern') {
      if (kind === 'benchmark') return 'Minimal';
      return INJURY_LABELS[factor.grade] ?? '—';
    }

    const raw = kind === 'benchmark' ? factor.benchmark : factor.value;
    if (raw == null || Number.isNaN(raw)) return '—';

    if (PCT_FACTORS.has(factor.factorId)) {
      const pct = raw <= 1 ? raw * 100 : raw;
      return `${pct.toFixed(1)}%`;
    }

    if (RANK_FACTORS.has(factor.factorId)) {
      if (kind === 'benchmark') return trimNum(raw, 2);
      return Number.isInteger(raw) ? String(raw) : trimNum(raw, 1);
    }

    if (Number.isInteger(raw)) return String(raw);
    return trimNum(raw, Math.abs(raw) >= 10 ? 1 : 2);
  }

  formatRank(n: number | null | undefined): string {
    if (n == null || Number.isNaN(n)) return '—';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  formatDelta(n: number): string {
    if (n === 0) return '0';
    const rounded = Math.round(n * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return rounded > 0 ? `+${text}` : text.replace('-', '−');
  }

  private groupFactors(factors: GradedFactor[]): FactorGroup[] {
    const buckets: Record<FactorCategory, GradedFactor[]> = {
      volume: [],
      situational: [],
      profile: [],
    };
    for (const f of factors) {
      const cat = (f.category ?? 'situational') as FactorCategory;
      (buckets[cat] ?? buckets.situational).push(f);
    }
    return (['volume', 'situational', 'profile'] as const)
      .filter((c) => buckets[c].length)
      .map((c) => ({
        category: c,
        label: CATEGORY_META[c].label,
        hint: `${buckets[c].length} factor${buckets[c].length === 1 ? '' : 's'} · ${CATEGORY_META[c].hint}`,
        factors: buckets[c],
      }));
  }

  private buildMetrics(e: PlayerEvaluation): MetricCard[] {
    const factors = e.ceiling.factors ?? [];
    const counts = this.gradeCounts(factors);
    const ceil = e.ceiling.ceilingScore;
    const known = e.ceiling.knownFactors;
    const total = factors.length || 12;
    const risk = Math.round(e.risk.riskProfile);
    const value = e.value.valueScore;
    const diff = this.marketDiffFromEval(e);

    const riskSub =
      risk < 25 ? 'durable profile' : risk < 45 ? 'moderate risk' : risk < 65 ? 'elevated risk' : 'high risk';

    let valueTone: MetricCard['tone'] = 'muted';
    let valueSub = 'fairly priced';
    let valueDisplay = this.formatDelta(value);
    let valueUnit = 'delta';

    if (diff != null) {
      valueDisplay = this.formatDelta(diff);
      if (diff > 2) {
        valueTone = 'bad';
        valueSub = 'priced at a premium';
      } else if (diff < -2) {
        valueTone = 'good';
        valueSub = 'available at a discount';
      }
    } else if (value < -2) {
      valueTone = 'bad';
      valueSub = 'priced at a premium';
    } else if (value > 2) {
      valueTone = 'good';
      valueSub = 'available at a discount';
    }

    return [
      {
        label: 'Ceiling score',
        value: e.ceiling.provisional || ceil == null ? '—' : String(ceil),
        unit: '/60',
        sub: e.ceiling.provisional
          ? 'provisional'
          : `${counts.green}G ${counts.yellow}Y ${counts.orange}O ${counts.red}R`,
        tone: !e.ceiling.provisional && (ceil ?? 0) >= 30 ? 'good' : 'muted',
      },
      {
        label: 'Confidence',
        value: String(known),
        unit: `/${total}`,
        sub: known === total ? 'all factors known' : `${total - known} unknown`,
        tone: known === total ? 'accent' : known >= total * 0.75 ? 'good' : 'warn',
      },
      {
        label: 'Injury risk',
        value: String(risk),
        unit: '/100',
        sub: riskSub,
        tone: risk < 25 ? 'good' : risk < 45 ? 'accent' : risk < 65 ? 'warn' : 'bad',
      },
      {
        label: 'Market value',
        value: valueDisplay,
        unit: valueUnit,
        sub: valueSub,
        tone: valueTone,
      },
    ];
  }

  private buildTeChecks(factors: GradedFactor[]): TeCheck[] {
    const byId = new Map(factors.map((f) => [f.factorId, f]));
    const target = byId.get('team_target_rank');
    const td = byId.get('rec_td_rank');
    const inline = byId.get('inline_pct');
    const routes = byId.get('route_participation');

    const targetVal = target?.value;
    const tdVal = td?.value;
    const inlineVal = inline?.value != null ? (inline.value <= 1 ? inline.value * 100 : inline.value) : null;
    const routeVal = routes?.value != null ? (routes.value <= 1 ? routes.value * 100 : routes.value) : null;

    return [
      {
        key: 'team_target_rank',
        label: 'First or second in team targets',
        valueLabel: targetVal != null ? this.toOrdinal(targetVal) : '—',
        passed: targetVal != null && targetVal <= 2,
      },
      {
        key: 'rec_td_rank',
        label: 'First or second in receiving TDs',
        valueLabel: tdVal != null ? this.toOrdinal(tdVal) : '—',
        passed: tdVal != null && tdVal <= 2,
      },
      {
        key: 'inline_pct',
        label: 'In-line rate under 50%',
        valueLabel: inlineVal != null ? `${inlineVal.toFixed(1)}%` : '—',
        passed: inlineVal != null && inlineVal < 50,
      },
      {
        key: 'route_participation',
        label: 'Route participation over 79.8%',
        valueLabel: routeVal != null ? `${routeVal.toFixed(1)}%` : '—',
        passed: routeVal != null && routeVal > 79.8,
      },
    ];
  }

  private buildInjurySeasons(e: PlayerEvaluation, p: Player): InjurySeason[] {
    const currentYear = 2025;
    const n = Math.min(4, Math.max(1, p.seasonsInLeague || 4));
    const rate = e.risk.components?.careerMissedRate ?? 0;
    const perSeason = Math.max(0, Math.round(rate * 17));
    const expected = Math.max(0, Math.round(e.risk.expectedGamesMissed));

    return Array.from({ length: n }, (_, i) => {
      const year = currentYear - (n - 1 - i);
      const missed = i === n - 1 ? Math.max(perSeason, expected > 3 ? expected : perSeason) : perSeason;
      // When durable, force zeros even if expected is a soft prior
      const value = rate < 0.05 && expected < 1.5 ? 0 : missed;
      return {
        year,
        missed: value,
        tone: value >= 4 ? 'bad' : value >= 2 ? 'warn' : 'good',
      };
    });
  }

  private buildMarketNarrative(e: PlayerEvaluation): string {
    const espn = e.value.espnProjectionRank;
    const blend = e.value.blendedRank;
    if (espn != null) {
      const diff = Math.round((blend - espn) * 10) / 10;
      const abs = Math.abs(diff);
      if (diff > 1) {
        return `ESPN ranks him ${abs} spots ahead of our blend, so the market is charging a premium rather than offering a discount. Grade the talent on its own — just do not expect to get him cheaply.`;
      }
      if (diff < -1) {
        return `ESPN ranks him ${abs} spots behind our blend, so the market is offering a discount relative to our board.`;
      }
      return 'Market and blend ranks are aligned — price looks fair relative to our board.';
    }
    const v = e.value.valueScore;
    if (v < -2) {
      return `ADP sits ahead of our blended rank (value ${this.formatDelta(v)}), so the market is charging a premium.`;
    }
    if (v > 2) {
      return `ADP sits behind our blended rank (value ${this.formatDelta(v)}), so there may be discount value here.`;
    }
    return 'ADP and our blended rank are close — no clear premium or discount signal.';
  }

  private formatWeightedBreakdown(factors: GradedFactor[]): string {
    const c = this.gradeCounts(factors);
    let out = '';
    if (c.green) out += `${c.green}×5`;
    if (c.yellow) out += `${out ? ' + ' : ''}${c.yellow}×3`;
    if (c.orange) out += `${out ? ' − ' : '−'}${c.orange}×1`;
    if (c.red) out += `${out ? ' − ' : '−'}${c.red}×3`;
    return out;
  }

  private gradeCounts(factors: GradedFactor[]) {
    return {
      green: factors.filter((f) => f.grade === 'green').length,
      yellow: factors.filter((f) => f.grade === 'yellow').length,
      orange: factors.filter((f) => f.grade === 'orange').length,
      red: factors.filter((f) => f.grade === 'red').length,
    };
  }

  private marketDiffFromEval(e: PlayerEvaluation): number | null {
    const espn = e.value.espnProjectionRank;
    if (espn == null) return null;
    return Math.round((e.value.blendedRank - espn) * 10) / 10;
  }

  private toOrdinal(n: number): string {
    const v = Math.round(n);
    const mod100 = v % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
    switch (v % 10) {
      case 1:
        return `${v}st`;
      case 2:
        return `${v}nd`;
      case 3:
        return `${v}rd`;
      default:
        return `${v}th`;
    }
  }
}

function trimNum(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.?0+$/, '');
}

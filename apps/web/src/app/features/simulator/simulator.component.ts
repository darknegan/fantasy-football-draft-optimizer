import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { catchError, finalize, forkJoin, of, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type {
  CommonRosterSlot,
  CompareStrategiesResult,
  League,
  ScoreHistogramBin,
  StrategyDefinition,
  StrategySimResult,
  StrategyTier,
} from '../../core/api.types';

type VariancePreset = 'fitted' | 'tight' | 'loose';

interface VarianceOption {
  id: VariancePreset;
  label: string;
  ratio: number;
  floor: number;
}

interface CompareRow {
  strategyId: string;
  name: string;
  tier: StrategyTier;
  topThirdRate: number;
  medianRosterScore: number;
  bustRate: number;
  selected: boolean;
}

const DISPLAY_ORDER = [
  'balanced',
  'hero_wr',
  'double_hero_rb',
  'elite_te',
  'hero_rb',
  'robust_rb',
  'double_hero_wr',
  'zero_rb',
  'elite_qb',
] as const;

const VARIANCE_OPTIONS: VarianceOption[] = [
  { id: 'fitted', label: 'Fitted to 2025', ratio: 0.12, floor: 1.5 },
  { id: 'tight', label: 'Tight board', ratio: 0.06, floor: 1 },
  { id: 'loose', label: 'Loose / chaotic', ratio: 0.2, floor: 3 },
];

/** Worker CPU budgets prefer fewer iterations; server also clamps. */
const ITERATION_OPTIONS = [100, 200, 400, 800] as const;

@Component({
  selector: 'app-simulator',
  templateUrl: './simulator.component.html',
  styleUrl: './simulator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimulatorComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly varianceOptions = VARIANCE_OPTIONS;
  readonly iterationOptions = ITERATION_OPTIONS;

  leagueId = '';
  readonly strategies = signal<StrategyDefinition[]>([]);
  readonly league = signal<League | null>(null);

  readonly strategyId = signal('balanced');
  readonly slot = signal(9);
  readonly iterations = signal<number>(200);
  readonly varianceId = signal<VariancePreset>('fitted');

  readonly loading = signal(true);
  readonly running = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<StrategySimResult | null>(null);
  readonly compare = signal<CompareStrategiesResult | null>(null);

  /** Last compare knobs (strategy-independent). Skip re-compare when unchanged. */
  private lastCompareKey: string | null = null;

  readonly selectedStrategy = computed(
    () => this.strategies().find((s) => s.id === this.strategyId()) ?? null,
  );

  readonly variance = computed(
    () => VARIANCE_OPTIONS.find((v) => v.id === this.varianceId()) ?? VARIANCE_OPTIONS[0]!,
  );

  readonly teamCount = computed(() => this.league()?.teamCount ?? 12);

  readonly slotOptions = computed(() => {
    const n = this.teamCount();
    return Array.from({ length: n }, (_, i) => i + 1);
  });

  readonly intro = computed(() => {
    const name = this.selectedStrategy()?.name ?? 'Strategy';
    const pick = this.formatSlot(this.slot());
    const iters = this.result()?.iterations ?? this.iterations();
    return `${name} from pick ${pick} · ${iters.toLocaleString()} simulated drafts · results depend on the ADP variance model`;
  });

  readonly histogram = computed((): ScoreHistogramBin[] => this.result()?.scoreHistogram ?? []);

  readonly maxHistRate = computed(() => {
    const bins = this.histogram();
    return Math.max(0.01, ...bins.map((b) => b.rate));
  });

  readonly commonRoster = computed((): CommonRosterSlot[] => this.result()?.commonRoster ?? []);

  readonly compareRows = computed((): CompareRow[] => {
    const c = this.compare();
    const selected = this.strategyId();
    if (!c?.results?.length) return [];
    const byId = new Map(c.results.map((r) => [r.strategyId, r]));
    return orderStrategies(this.strategies())
      .map((s) => {
        const r = byId.get(s.id);
        if (!r) return null;
        return {
          strategyId: s.id,
          name: s.name,
          tier: s.tier,
          topThirdRate: r.topThirdRate,
          medianRosterScore: r.medianRosterScore,
          bustRate: r.bustRate ?? 0,
          selected: s.id === selected,
        };
      })
      .filter((r): r is CompareRow => r != null);
  });

  ngOnInit(): void {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    forkJoin({
      strategies: this.api.strategies(),
      league: this.api.league(this.leagueId),
    }).subscribe({
      next: ({ strategies, league }) => {
        this.strategies.set(orderStrategies(strategies));
        this.league.set(league);
        if (league.strategyId) this.strategyId.set(league.strategyId);
        if (league.draftSlot) this.slot.set(league.draftSlot);
        this.loading.set(false);
        this.runSimulation();
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.error.set(err.message || 'Failed to load simulator.');
      },
    });
  }

  runSimulation(opts?: { compare?: boolean }): void {
    if (!this.leagueId || this.running()) return;
    this.running.set(true);
    this.error.set(null);
    const v = this.variance();
    const body = {
      strategyId: this.strategyId(),
      draftSlot: this.slot(),
      iterations: this.iterations(),
      rounds: 8,
      adpVarianceRatio: v.ratio,
      adpVarianceFloor: v.floor,
    };
    const compareKey = [
      body.draftSlot,
      body.iterations,
      body.adpVarianceRatio,
      body.adpVarianceFloor,
      body.rounds,
    ].join('|');
    // Compare is strategy-agnostic — only refresh when slot/variance/iterations change.
    const needCompare =
      opts?.compare !== false && (this.compare() == null || this.lastCompareKey !== compareKey);
    const compareIds = this.strategies().map((s) => s.id);

    // Sequential: never overlap simulate + multi-strategy compare on the Worker.
    this.api
      .simulate(this.leagueId, body)
      .pipe(
        tap((result) => this.result.set(result)),
        switchMap(() => {
          if (!needCompare) return of(null);
          return this.api
            .compareStrategies(this.leagueId, {
              draftSlot: body.draftSlot,
              iterations: Math.min(body.iterations, 60),
              rounds: body.rounds,
              adpVarianceRatio: body.adpVarianceRatio,
              adpVarianceFloor: body.adpVarianceFloor,
              strategyIds: compareIds.length ? compareIds : undefined,
            })
            .pipe(catchError(() => of(null)));
        }),
        finalize(() => this.running.set(false)),
      )
      .subscribe({
        next: (compare) => {
          if (compare) {
            this.compare.set(compare);
            this.lastCompareKey = compareKey;
          }
        },
        error: (err: Error) => {
          this.error.set(err.message || 'Simulation failed.');
        },
      });
  }

  onStrategyChange(event: Event): void {
    this.strategyId.set((event.target as HTMLSelectElement).value);
  }

  onSlotChange(event: Event): void {
    this.slot.set(Number((event.target as HTMLSelectElement).value));
  }

  onIterationsChange(event: Event): void {
    this.iterations.set(Number((event.target as HTMLSelectElement).value));
  }

  onVarianceChange(event: Event): void {
    this.varianceId.set((event.target as HTMLSelectElement).value as VariancePreset);
  }

  selectCompareRow(id: string): void {
    this.strategyId.set(id);
    // Strategy change only needs a single-strategy simulate — reuse compare table.
    this.runSimulation({ compare: false });
  }

  formatSlot(slot: number): string {
    return `1.${String(slot).padStart(2, '0')}`;
  }

  formatPct(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  formatScore(n: number): string {
    return Math.round(n).toLocaleString();
  }

  barHeight(bin: ScoreHistogramBin): number {
    const max = this.maxHistRate();
    return Math.max(4, Math.round((bin.rate / max) * 176));
  }

  tierClass(tier: StrategyTier): string {
    return tier === 'unrated' ? 'unrated' : tier;
  }

  tierGlyph(tier: StrategyTier): string {
    return tier === 'unrated' ? '–' : tier;
  }

  bustTone(rate: number): string {
    return rate >= 0.22 ? 'bad' : '';
  }
}

function orderStrategies(list: StrategyDefinition[]): StrategyDefinition[] {
  const rank = new Map<string, number>(DISPLAY_ORDER.map((id, i) => [id, i]));
  return [...list].sort(
    (a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || a.name.localeCompare(b.name),
  );
}

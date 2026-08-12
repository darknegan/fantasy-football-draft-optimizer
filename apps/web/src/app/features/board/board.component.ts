import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { BoardPlayer, FactorGrade, League, Position } from '../../core/api.types';

type PosFilter = Position | 'ALL';
type SortKey = 'draft' | 'ceiling' | 'adp' | 'value' | 'risk' | 'proj';
type RiskFilter = 'any' | 'low' | 'mid' | 'high';
type ValueFilter = 'any' | 'positive' | 'negative' | 'even';

interface BoardSection {
  tier: number;
  note: string;
  rows: BoardPlayer[];
}

const POS_TABS: PosFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'draft', label: 'Draft score' },
  { value: 'ceiling', label: 'Ceiling' },
  { value: 'adp', label: 'ADP' },
  { value: 'value', label: 'Value' },
  { value: 'risk', label: 'Risk' },
  { value: 'proj', label: 'Proj' },
];

const FACTOR_SLOTS = 12;
const RISK_MAX = 100;

@Component({
  selector: 'app-board',
  imports: [RouterLink],
  template: `
    <div class="board">
      <div class="filters">
        <div class="pos-tabs" role="tablist" aria-label="Position">
          @for (tab of posTabs; track tab) {
            <button
              type="button"
              role="tab"
              class="pos-tab"
              [class.active]="posFilter() === tab"
              [attr.aria-selected]="posFilter() === tab"
              (click)="posFilter.set(tab)"
            >
              {{ tab }}
            </button>
          }
        </div>

        <label class="filter-btn">
          <span class="sr-only">Archetype</span>
          <select [value]="archetypeFilter()" (change)="onArchetype($event)">
            <option value="all">Archetype: all</option>
            @for (a of archetypes(); track a) {
              <option [value]="a">{{ formatArchetype(a) }}</option>
            }
          </select>
        </label>

        <label class="filter-btn">
          <span class="sr-only">Risk</span>
          <select [value]="riskFilter()" (change)="onRisk($event)">
            <option value="any">Risk: any</option>
            <option value="low">Risk: low</option>
            <option value="mid">Risk: mid</option>
            <option value="high">Risk: high</option>
          </select>
        </label>

        <label class="filter-btn">
          <span class="sr-only">Value</span>
          <select [value]="valueFilter()" (change)="onValue($event)">
            <option value="any">Value: any</option>
            <option value="positive">Value: +</option>
            <option value="even">Value: 0</option>
            <option value="negative">Value: −</option>
          </select>
        </label>

        <button
          type="button"
          class="filter-btn"
          [class.active]="hideDrafted()"
          (click)="hideDrafted.set(!hideDrafted())"
        >
          {{ hideDrafted() ? 'Show drafted' : 'Hide drafted' }}
        </button>

        <div class="filters-spacer"></div>

        <label class="filter-btn">
          <span class="sr-only">Sort</span>
          <select [value]="sortKey()" (change)="onSort($event)">
            @for (opt of sortOptions; track opt.value) {
              <option [value]="opt.value">Sort: {{ opt.label }}</option>
            }
          </select>
        </label>

        <a class="filter-btn link" [routerLink]="['/leagues', leagueId, 'calibration']">
          Adjust weights
        </a>
      </div>

      <div class="col-head" aria-hidden="true">
        <span class="c-rank">#</span>
        <span class="c-pos">POS</span>
        <span class="c-player">PLAYER</span>
        <span class="c-adp">ADP</span>
        <span class="c-ceiling">CEILING</span>
        <span class="c-conf">CONF</span>
        <span class="c-arch">ARCHETYPE</span>
        <span class="c-risk">RISK</span>
        <span class="c-value">VALUE</span>
        <span class="c-proj">PROJ</span>
        <span class="c-factors">12 FACTORS</span>
        <span class="c-flag"></span>
      </div>

      <div class="list" role="list">
        @for (section of sections(); track section.tier) {
          <div class="tier-break">
            <span class="tier-tag">TIER {{ section.tier }}</span>
            <span class="tier-note">{{ section.note }}</span>
            <span class="tier-rule" aria-hidden="true"></span>
          </div>

          @for (row of section.rows; track row.player.id) {
            <div
              class="row"
              role="listitem"
              [class.drafted]="row.drafted"
              [class.target]="row.target"
              [class.avoid]="row.avoid"
            >
              <span class="c-rank mono">{{
                row.drafted ? '—' : (row.recommendation?.rank ?? rankOf(row))
              }}</span>

              <span class="c-pos">
                <span class="pos" [class]="row.player.position">{{ row.player.position }}</span>
              </span>

              <a
                class="c-player player"
                [routerLink]="['/leagues', leagueId, 'board', row.player.id]"
              >
                @if (headshotOf(row); as src) {
                  <img
                    class="headshot"
                    [src]="src"
                    [alt]=""
                    width="28"
                    height="28"
                    loading="lazy"
                    decoding="async"
                    (error)="onHeadshotError(row.player.id)"
                  />
                } @else {
                  <span class="headshot fallback" aria-hidden="true">{{
                    row.player.position
                  }}</span>
                }
                <span class="player-text">
                  <span class="name">{{ row.player.name }}</span>
                  <span class="meta"
                    >{{ row.player.team }} · Age {{ row.player.age }} · Yr
                    {{ row.player.seasonsInLeague }}</span
                  >
                </span>
              </a>

              <span class="c-adp mono">{{ row.evaluation.value.adpRoundPick }}</span>

              <span class="c-ceiling mono">
                @if (row.evaluation.ceiling.provisional) {
                  <span class="ceil-score muted">—</span>
                  <span class="ceil-den muted">/60</span>
                } @else {
                  <span
                    class="ceil-score"
                    [class.good]="(row.evaluation.ceiling.ceilingScore ?? 0) >= 30"
                    >{{ row.evaluation.ceiling.ceilingScore ?? '—' }}</span
                  >
                  <span class="ceil-den muted">/60</span>
                }
              </span>

              <span class="c-conf mono" [class.prov]="row.evaluation.ceiling.provisional">
                @if (row.evaluation.ceiling.provisional) {
                  prov.
                } @else {
                  {{ row.evaluation.ceiling.knownFactors }}/{{ factorSlots }}
                }
              </span>

              <span class="c-arch">
                <span
                  class="arch"
                  [class]="archTone(row.evaluation.archetype.archetype)"
                  [title]="archTitle(row)"
                >
                  <span class="arch-dot" aria-hidden="true"></span>
                  {{ formatArchetype(row.evaluation.archetype.archetype) }}
                </span>
              </span>

              <span class="c-risk">
                <span class="risk-n mono" [class]="riskTone(row.evaluation.risk.riskProfile)">{{
                  Math.round(row.evaluation.risk.riskProfile)
                }}</span>
                <span class="risk-track" aria-hidden="true">
                  <span
                    class="risk-fill"
                    [class]="riskTone(row.evaluation.risk.riskProfile)"
                    [style.width.%]="riskWidth(row.evaluation.risk.riskProfile)"
                  ></span>
                </span>
              </span>

              <span class="c-value">
                <span class="val-chip" [class]="valueTone(row.evaluation.value.valueScore)">{{
                  formatValue(row.evaluation.value.valueScore)
                }}</span>
              </span>

              <span class="c-proj mono">{{ formatProj(row.projectedPoints) }}</span>

              <span class="c-factors" aria-label="Factor grades">
                @for (g of factorGrades(row); track $index) {
                  <span class="fcell" [class]="g" [title]="g"></span>
                }
              </span>

              <button
                type="button"
                class="c-flag flag"
                [class.on]="row.target"
                [class.avoid-on]="row.avoid"
                (click)="toggleTarget(row)"
                [attr.aria-pressed]="!!row.target"
                [title]="row.target ? 'Remove target' : 'Mark target'"
              >
                ★
              </button>
            </div>
          }
        } @empty {
          <p class="empty">No players match these filters.</p>
        }
      </div>
    </div>
  `,
  styleUrl: './board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly Math = Math;
  readonly posTabs = POS_TABS;
  readonly sortOptions = SORT_OPTIONS;
  readonly factorSlots = FACTOR_SLOTS;

  leagueId = '';
  readonly rows = signal<BoardPlayer[]>([]);
  readonly league = signal<League | null>(null);

  readonly posFilter = signal<PosFilter>('ALL');
  readonly archetypeFilter = signal('all');
  readonly riskFilter = signal<RiskFilter>('any');
  readonly valueFilter = signal<ValueFilter>('any');
  readonly hideDrafted = signal(true);
  readonly sortKey = signal<SortKey>('draft');
  readonly brokenHeadshots = signal<ReadonlySet<string>>(new Set());

  readonly archetypes = computed(() => {
    const set = new Set(this.rows().map((r) => r.evaluation.archetype.archetype));
    return [...set].sort();
  });

  readonly filteredSorted = computed(() => {
    let list = this.rows();
    const pos = this.posFilter();
    if (pos !== 'ALL') list = list.filter((r) => r.player.position === pos);
    if (this.hideDrafted()) list = list.filter((r) => !r.drafted);

    const arch = this.archetypeFilter();
    if (arch !== 'all') list = list.filter((r) => r.evaluation.archetype.archetype === arch);

    const risk = this.riskFilter();
    if (risk !== 'any') {
      list = list.filter((r) => riskBucket(r.evaluation.risk.riskProfile) === risk);
    }

    const value = this.valueFilter();
    if (value === 'positive') list = list.filter((r) => r.evaluation.value.valueScore > 0);
    if (value === 'negative') list = list.filter((r) => r.evaluation.value.valueScore < 0);
    if (value === 'even') list = list.filter((r) => r.evaluation.value.valueScore === 0);

    const key = this.sortKey();
    return [...list].sort((a, b) => compareRows(a, b, key));
  });

  readonly sections = computed((): BoardSection[] => {
    const rows = this.filteredSorted();
    if (!rows.length) return [];
    const league = this.league();
    const nextPick = estimateNextUserPick(league);
    return buildSections(rows, nextPick, league?.teamCount ?? 12);
  });

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    forkJoin({
      board: this.api.board(this.leagueId),
      league: this.api.league(this.leagueId),
    }).subscribe(({ board, league }) => {
      this.rows.set(board);
      this.league.set(league);
    });
  }

  onArchetype(ev: Event) {
    this.archetypeFilter.set((ev.target as HTMLSelectElement).value);
  }

  onRisk(ev: Event) {
    this.riskFilter.set((ev.target as HTMLSelectElement).value as RiskFilter);
  }

  onValue(ev: Event) {
    this.valueFilter.set((ev.target as HTMLSelectElement).value as ValueFilter);
  }

  onSort(ev: Event) {
    this.sortKey.set((ev.target as HTMLSelectElement).value as SortKey);
  }

  rankOf(row: BoardPlayer): number {
    const idx = this.filteredSorted().findIndex((r) => r.player.id === row.player.id);
    return idx >= 0 ? idx + 1 : 0;
  }

  headshotOf(row: BoardPlayer): string | null {
    if (this.brokenHeadshots().has(row.player.id)) return null;
    return row.player.headshotThumbUrl || row.player.headshotUrl || null;
  }

  onHeadshotError(playerId: string): void {
    this.brokenHeadshots.update((prev) => {
      if (prev.has(playerId)) return prev;
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  }

  formatArchetype(a: string): string {
    switch (a.toUpperCase()) {
      case 'ELITE':
        return 'Elite';
      case 'PROVEN_BREAKOUT_CANDIDATE':
        return 'Proven';
      case 'TRUSTY_VETERAN':
        return 'Trusty Veteran';
      case 'VETERAN':
        return 'Veteran';
      case 'IN_THEIR_PRIME':
        return 'In Their Prime';
      case 'BREAKOUT_CANDIDATE':
        return 'Breakout';
      default:
        return a
          .replaceAll('_', ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  archTone(a: string): string {
    switch (a.toUpperCase()) {
      case 'ELITE':
      case 'PROVEN_BREAKOUT_CANDIDATE':
      case 'TRUSTY_VETERAN':
        return 'good';
      case 'IN_THEIR_PRIME':
        return 'mid';
      case 'BREAKOUT_CANDIDATE':
        return 'warn';
      case 'VETERAN':
        return 'bad';
      default:
        return 'mid';
    }
  }

  archTitle(row: BoardPlayer): string {
    return `${this.formatArchetype(row.evaluation.archetype.archetype)} · EV ${row.evaluation.archetype.archetypeEv.toFixed(2)}`;
  }

  riskTone(risk: number): string {
    if (risk < 25) return 'good';
    if (risk < 45) return 'mid';
    if (risk < 65) return 'warn';
    return 'bad';
  }

  riskWidth(risk: number): number {
    return Math.max(8, Math.min(100, (risk / RISK_MAX) * 100));
  }

  valueTone(v: number): string {
    if (v > 0) return 'good';
    if (v < 0) return 'bad';
    return 'flat';
  }

  formatValue(v: number): string {
    if (v === 0) return '0';
    const rounded = Math.round(v);
    return rounded > 0 ? `+${rounded}` : `${rounded}`.replace('-', '−');
  }

  formatProj(p: number | null | undefined): string {
    if (p == null || Number.isNaN(p)) return '—';
    return p.toFixed(1);
  }

  factorGrades(row: BoardPlayer): FactorGrade[] {
    const factors = row.evaluation.ceiling.factors ?? [];
    const grades = factors.slice(0, FACTOR_SLOTS).map((f) => f.grade);
    while (grades.length < FACTOR_SLOTS) grades.push('unknown');
    return grades;
  }

  toggleTarget(row: BoardPlayer) {
    const next = !row.target;
    this.api.setFlag(this.leagueId, row.player.id, 'target', next).subscribe(() => {
      this.api.board(this.leagueId).subscribe((b) => this.rows.set(b));
    });
  }
}

function riskBucket(risk: number): RiskFilter {
  if (risk < 30) return 'low';
  if (risk < 55) return 'mid';
  return 'high';
}

function adpOverall(adp: string, teamCount: number): number {
  const m = /^(\d+)\.(\d+)$/.exec(adp.trim());
  if (!m) return 999;
  const round = Number(m[1]);
  const slot = Number(m[2]);
  return (round - 1) * teamCount + slot;
}

function compareRows(a: BoardPlayer, b: BoardPlayer, key: SortKey): number {
  switch (key) {
    case 'ceiling':
      return (b.evaluation.ceiling.ceilingScore ?? -1) - (a.evaluation.ceiling.ceilingScore ?? -1);
    case 'adp':
      return (
        adpOverall(a.evaluation.value.adpRoundPick, 12) -
        adpOverall(b.evaluation.value.adpRoundPick, 12)
      );
    case 'value':
      return b.evaluation.value.valueScore - a.evaluation.value.valueScore;
    case 'risk':
      return a.evaluation.risk.riskProfile - b.evaluation.risk.riskProfile;
    case 'proj':
      return (b.projectedPoints ?? -1) - (a.projectedPoints ?? -1);
    case 'draft':
    default: {
      const as = a.recommendation?.contextualScore ?? a.evaluation.draftScore;
      const bs = b.recommendation?.contextualScore ?? b.evaluation.draftScore;
      return bs - as;
    }
  }
}

function estimateNextUserPick(league: League | null): number {
  if (!league?.draftSlot) return 9;
  return league.draftSlot;
}

function buildSections(
  rows: BoardPlayer[],
  nextPickSlot: number,
  teamCount: number,
): BoardSection[] {
  const scores = rows.map((r) => r.evaluation.draftScore).sort((a, b) => a - b);
  const pct = (p: number) => scores[Math.max(0, Math.floor((scores.length - 1) * p))] ?? 0;
  const cuts = [
    { tier: 1, min: pct(0.9) },
    { tier: 2, min: pct(0.75) },
    { tier: 3, min: pct(0.5) },
    { tier: 4, min: -Infinity },
  ];

  const buckets = new Map<number, BoardPlayer[]>();
  for (const row of rows) {
    const score = row.evaluation.draftScore;
    const cut = cuts.find((c) => score >= c.min) ?? cuts[cuts.length - 1]!;
    const list = buckets.get(cut.tier) ?? [];
    list.push(row);
    buckets.set(cut.tier, list);
  }

  const nextOverall = nextPickSlot; // first-round pick approximation for pre-draft survival
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, list]) => list.length > 0)
    .map(([tier, list]) => ({
      tier,
      rows: list,
      note: survivalNote(list, nextOverall, teamCount),
    }));
}

function survivalNote(rows: BoardPlayer[], nextOverall: number, teamCount: number): string {
  const left = rows.filter((r) => !r.drafted);
  const n = left.length || rows.length;
  const pickLabel = formatOverallPick(nextOverall + teamCount, teamCount);
  const gone = left.filter(
    (r) => adpOverall(r.evaluation.value.adpRoundPick, teamCount) <= nextOverall,
  ).length;
  if (gone >= n && n > 0) {
    return `${n} players left · all ${n} gone before your next pick`;
  }
  if (tierLooksTeWindow(rows)) {
    return `${n} players · the elite TE window opens here`;
  }
  const survivors = Math.max(1, Math.round(n * 0.4));
  return `${n} players · ${survivors}–${survivors + 1} should survive to ${pickLabel}`;
}

function formatOverallPick(overall: number, teamCount: number): string {
  const round = Math.floor((overall - 1) / teamCount) + 1;
  const slot = ((overall - 1) % teamCount) + 1;
  return `${round}.${String(slot).padStart(2, '0')}`;
}

function tierLooksTeWindow(rows: BoardPlayer[]): boolean {
  const tes = rows.filter((r) => r.player.position === 'TE').length;
  return tes >= Math.max(2, Math.floor(rows.length * 0.3));
}

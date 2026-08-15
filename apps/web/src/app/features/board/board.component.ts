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
import {
  adpOverall,
  qualityBand,
  detectCliffs,
  replacementBand,
  computeVor,
  resolveVorScoringFormat,
  type QualityBand,
} from '@draftlab/tiers';
import { ApiService } from '../../core/api.service';
import type { BoardPlayer, DraftState, FactorGrade, League, Position, RosterShape } from '../../core/api.types';
import {
  BOARD_HEADER_PURPOSE,
  buildArchetypeTooltip,
  buildCeilingTooltip,
  buildScoreTooltip,
  explainBoardArchetype,
} from './board-tooltips';
import { configuredFactorCount, top5CeilingIdsByPosition } from './ceiling-display';
import { scoreLabel } from './score-label';

type PosFilter = Position | 'ALL';
type SortKey = 'vor' | 'draft' | 'ceiling' | 'adp' | 'value' | 'risk' | 'proj';
type RiskFilter = 'any' | 'low' | 'mid' | 'high';
type ValueFilter = 'any' | 'positive' | 'negative' | 'even';

const POS_TABS: PosFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'vor', label: 'VOR' },
  { value: 'proj', label: 'Proj' },
  { value: 'ceiling', label: 'Ceiling' },
  { value: 'draft', label: 'Draft score' },
  { value: 'adp', label: 'ADP' },
  { value: 'value', label: 'Value' },
  { value: 'risk', label: 'Risk' },
];

const DEFAULT_ROSTER: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  bench: 6,
  totalStarters: 7,
};

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

      <div class="col-head">
        <span class="c-rank" [title]="headerPurpose['#']">#</span>
        <span class="c-pos" [title]="headerPurpose['POS']">POS</span>
        <span class="c-band">GRADE</span>
        <span class="c-player" [title]="headerPurpose['PLAYER']">PLAYER</span>
        <span class="c-adp" [title]="headerPurpose['ADP']">ADP</span>
        <span class="c-score" [title]="headerPurpose['SCORE']">SCORE</span>
        <span class="c-ceiling" [title]="headerPurpose['CEILING']">CEILING</span>
        <span class="c-conf" [title]="headerPurpose['CONF']">CONF</span>
        <span class="c-arch" [title]="headerPurpose['ARCHETYPE']">ARCHETYPE</span>
        <span class="c-risk" [title]="headerPurpose['RISK']">RISK</span>
        <span class="c-value" [title]="headerPurpose['VALUE']">VALUE</span>
        <span class="c-vor" [title]="headerPurpose['VOR']">VOR</span>
        <span class="c-proj" [title]="headerPurpose['PROJ']">PROJ</span>
        <span class="c-factors" [title]="headerPurpose['FACTORS']">FACTORS</span>
        <span class="c-flag" [title]="headerPurpose['FLAG']"></span>
      </div>

      <div class="list" role="list">
        @for (row of filteredSorted(); track row.player.id) {
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

              <span class="c-band">
                @if (bandOf(row); as band) {
                  <span class="chip band" [class]="'band-' + band">{{ band }}</span>
                } @else {
                  <span class="chip band band-none" title="No measured data">—</span>
                }
                <span class="chip slot">{{ replacementOf(row) }}</span>
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

              <span class="c-score mono has-tip" tabindex="0">
                {{ scoreLabel(row) }}
                <span class="tip" role="tooltip">{{ scoreTooltip(row) }}</span>
              </span>

              <span class="c-ceiling mono has-tip" tabindex="0">
                @if (row.evaluation.ceiling.provisional) {
                  <span class="ceil-score muted">—</span>
                } @else {
                  <span class="ceil-score" [class.good]="top5Ids().has(row.player.id)">{{
                    row.evaluation.ceiling.ceilingScore ?? '—'
                  }}</span>
                }
                <span class="tip" role="tooltip">{{
                  ceilingTooltip(row, top5Ids().has(row.player.id))
                }}</span>
              </span>

              <span class="c-conf mono" [class.prov]="row.evaluation.ceiling.provisional">
                @if (row.evaluation.ceiling.provisional) {
                  prov.
                } @else {
                  {{ row.evaluation.ceiling.knownFactors }}/{{ configuredFactorCount(row) }}
                }
              </span>

              <span class="c-arch has-tip" tabindex="0">
                <span class="arch" [class]="archTone(row.evaluation.archetype.archetype)">
                  <span class="arch-dot" aria-hidden="true"></span>
                  {{ formatArchetype(row.evaluation.archetype.archetype) }}
                </span>
                <span class="tip" role="tooltip">{{ archetypeTooltip(row) }}</span>
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

              <span class="c-vor mono">{{ formatVor(vorOf(row)) }}</span>

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
            @if (cliffAfterIds().get(row.player.id); as cliff) {
              <div class="cliff-marker" role="separator">
                <span class="cliff-label"
                  >⌄ cliff — {{ cliff.gap }} pt gap ({{ cliff.multiple }}× typical)</span
                >
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
  readonly configuredFactorCount = configuredFactorCount;
  readonly scoreLabel = scoreLabel;
  readonly headerPurpose = BOARD_HEADER_PURPOSE;
  readonly scoreTooltip = buildScoreTooltip;
  readonly ceilingTooltip = buildCeilingTooltip;

  leagueId = '';
  readonly rows = signal<BoardPlayer[]>([]);
  readonly league = signal<League | null>(null);
  readonly draft = signal<DraftState | null>(null);

  readonly posFilter = signal<PosFilter>('ALL');
  readonly archetypeFilter = signal('all');
  readonly riskFilter = signal<RiskFilter>('any');
  readonly valueFilter = signal<ValueFilter>('any');
  readonly hideDrafted = signal(true);
  readonly sortKey = signal<SortKey>('vor');
  readonly brokenHeadshots = signal<ReadonlySet<string>>(new Set());

  readonly archetypes = computed(() => {
    const set = new Set(this.rows().map((r) => r.evaluation.archetype.archetype));
    return [...set].sort();
  });

  readonly top5Ids = computed(() => top5CeilingIdsByPosition(this.rows()));

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
    const teamCount = this.league()?.teamCount ?? 12;
    return [...list].sort((a, b) => compareRows(a, b, key, teamCount, this.vorById()));
  });

  /**
   * VOR over the FULL board, not the filtered view — baselines must not
   * jump when the user filters to one position or hides drafted rows.
   */
  readonly vorById = computed(() => {
    const league = this.league();
    return computeVor(
      this.rows().map((r) => ({
        id: r.player.id,
        position: r.player.position,
        projectedPoints: r.projectedPoints,
      })),
      league?.roster ?? DEFAULT_ROSTER,
      league?.teamCount ?? 12,
      resolveVorScoringFormat({
        reception: league?.scoring?.reception,
        variant: league?.scoring?.variant ?? league?.scoringSummary?.variant,
      }),
    );
  });

  /**
   * Positional rank by draftScore, over the FULL board rather than the filtered
   * view. Replacement chips must not change when the user filters to one
   * position — that's the exact defect this redesign removes.
   */
  private readonly positionRanks = computed(() => {
    const ranks = new Map<string, number>();
    const byPosition = new Map<Position, BoardPlayer[]>();
    for (const row of this.rows()) {
      const list = byPosition.get(row.player.position) ?? [];
      list.push(row);
      byPosition.set(row.player.position, list);
    }
    for (const list of byPosition.values()) {
      list
        .slice()
        .sort((a, b) => b.evaluation.draftScore - a.evaluation.draftScore)
        .forEach((row, index) => ranks.set(row.player.id, index + 1));
    }
    return ranks;
  });

  /** True when the current sort orders rows by a score, making adjacency meaningful. */
  private readonly cliffsApply = computed(() => {
    const key = this.sortKey();
    return key === 'vor' || key === 'proj' || key === 'ceiling' || key === 'draft';
  });

  /**
   * Row ids after which a cliff falls. Computed on the same axis the list is
   * sorted by (VOR under VOR, projectedPoints under Proj, raw ceilingScore
   * under Ceiling, contextualScore ?? draftScore under Draft score), so the
   * marker always sits between the two rows it describes. Hidden entirely
   * under any other sort, since adjacency is not score-ordered there.
   */
  readonly cliffAfterIds = computed((): ReadonlyMap<string, { gap: number; multiple: number }> => {
    const out = new Map<string, { gap: number; multiple: number }>();
    if (!this.cliffsApply()) return out;
    const key = this.sortKey();
    const rows = this.filteredSorted();
    const measured = rows.filter((r) => r.evaluation.ceiling.knownFactors > 0 && !r.drafted);
    const scores = measured.map((r) => scoreForSort(r, key, this.vorById()));
    for (const cliff of detectCliffs(scores)) {
      const row = measured[cliff.afterIndex];
      const nextRow = measured[cliff.afterIndex + 1];
      if (!row || !nextRow) continue;
      // Only mark a cliff when the two measured rows are adjacent in the
      // rendered list. With "Show drafted" on, drafted rows sit between
      // measured neighbors and would otherwise get a misleading marker.
      const idxA = rows.findIndex((r) => r.player.id === row.player.id);
      const idxB = rows.findIndex((r) => r.player.id === nextRow.player.id);
      if (idxB !== idxA + 1) continue;
      out.set(row.player.id, { gap: cliff.gap, multiple: cliff.multiple });
    }
    return out;
  });

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    forkJoin({
      board: this.api.board(this.leagueId),
      league: this.api.league(this.leagueId),
      draft: this.api.draft(this.leagueId),
    }).subscribe(({ board, league, draft }) => {
      this.rows.set(board);
      this.league.set(league);
      this.draft.set(draft);
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

  /** Absolute quality grade. Independent of filter and of who has been drafted. */
  bandOf(row: BoardPlayer): QualityBand | null {
    return qualityBand(row.evaluation.draftScore, row.evaluation.ceiling.knownFactors);
  }

  /** Which roster slot this player realistically fills in THIS league. */
  replacementOf(row: BoardPlayer): string {
    const league = this.league();
    if (!league?.roster) return '';
    return replacementBand(
      this.positionRank(row),
      row.player.position,
      league.roster,
      league.teamCount,
    ).label;
  }

  private positionRank(row: BoardPlayer): number {
    return this.positionRanks().get(row.player.id) ?? Number.MAX_SAFE_INTEGER;
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

  archetypeTooltip(row: BoardPlayer): string {
    return buildArchetypeTooltip(row, explainBoardArchetype(row));
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

  vorOf(row: BoardPlayer): number | null {
    return this.vorById().get(row.player.id) ?? null;
  }

  formatVor(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '—';
    const rounded = v.toFixed(1);
    return v > 0 ? `+${rounded}` : rounded;
  }

  factorGrades(row: BoardPlayer): FactorGrade[] {
    const slots = configuredFactorCount(row);
    const factors = row.evaluation.ceiling.factors ?? [];
    const grades = factors.slice(0, slots).map((f) => f.grade);
    while (grades.length < slots) grades.push('unknown');
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

/** Numeric axis for score-based sorts. Missing values sort last via -1. */
function scoreForSort(
  row: BoardPlayer,
  key: SortKey,
  vorById: ReadonlyMap<string, number | null> = new Map(),
): number {
  if (key === 'vor') return vorById.get(row.player.id) ?? -1;
  if (key === 'proj') return row.projectedPoints ?? -1;
  if (key === 'ceiling') return row.evaluation.ceiling.ceilingScore ?? -1;
  return row.recommendation?.contextualScore ?? row.evaluation.draftScore;
}

function compareRows(
  a: BoardPlayer,
  b: BoardPlayer,
  key: SortKey,
  teamCount: number,
  vorById: ReadonlyMap<string, number | null> = new Map(),
): number {
  switch (key) {
    case 'vor': {
      const byVor = scoreForSort(b, 'vor', vorById) - scoreForSort(a, 'vor', vorById);
      if (byVor !== 0) return byVor;
      return (b.projectedPoints ?? -1) - (a.projectedPoints ?? -1);
    }
    case 'ceiling': {
      const byCeil = scoreForSort(b, 'ceiling') - scoreForSort(a, 'ceiling');
      if (byCeil !== 0) return byCeil;
      return (b.projectedPoints ?? -1) - (a.projectedPoints ?? -1);
    }
    case 'adp': {
      // Package adpOverall returns null for unparseable ADP. Sort those last rather
      // than letting a sentinel rank them as very early or very late.
      const av = adpOverall(a.evaluation.value.adpRoundPick, teamCount);
      const bv = adpOverall(b.evaluation.value.adpRoundPick, teamCount);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return av - bv;
    }
    case 'value':
      return b.evaluation.value.valueScore - a.evaluation.value.valueScore;
    case 'risk':
      return a.evaluation.risk.riskProfile - b.evaluation.risk.riskProfile;
    case 'proj':
      return scoreForSort(b, 'proj') - scoreForSort(a, 'proj');
    case 'draft':
    default:
      return scoreForSort(b, 'draft') - scoreForSort(a, 'draft');
  }
}


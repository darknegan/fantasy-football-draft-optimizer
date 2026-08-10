import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type {
  CompareStrategiesResult,
  DraftSlotInfo,
  League,
  Position,
  StrategyDefinition,
  StrategyTier,
} from '../../core/api.types';

/** Historical league-winner rates by round/position (Round League Winners.PNG). */
const ROUND_WINNER_RATES: Record<number, Partial<Record<Position, number>>> = {
  1: { RB: 0.22, WR: 0.18, TE: 0 },
  2: { QB: 0, RB: 0.26, WR: 0.25, TE: 0.43 },
  3: { QB: 0.38, RB: 0.18, WR: 0.05, TE: 0.25 },
  4: { QB: 0.3, RB: 0.19, WR: 0.15, TE: 0 },
  5: { QB: 0.07, RB: 0.1, WR: 0.08, TE: 0.06 },
  6: { QB: 0, RB: 0.07, WR: 0.05, TE: 0.15 },
  7: { QB: 0.1, RB: 0, WR: 0.03, TE: 0 },
  8: { QB: 0, RB: 0, WR: 0.03, TE: 0 },
  9: { QB: 0, RB: 0, WR: 0.03, TE: 0 },
  10: { QB: 0, RB: 0.04, WR: 0, TE: 0.2 },
};

const PLAN_ROUNDS = [1, 2, 3, 4, 5, 6, 7, 10];
const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

interface RoundPlanRow {
  round: number;
  rates: Record<Position, number | null>;
  targets: Position[];
  avoids: Position[];
}

interface CompareBar {
  strategyId: string;
  name: string;
  topThirdRate: number;
  meanRosterScore: number;
  best: boolean;
}

@Component({
  selector: 'app-strategy',
  template: `
    <div class="page">
      <div class="left">
        <div class="head">
          <h2>Choose a strategy</h2>
          <span class="hint">Balanced is the default — the sharper archetypes are opt-in</span>
        </div>

        <section class="strategy-grid" aria-label="Draft strategies">
          @for (s of strategies(); track s.id) {
            <button
              type="button"
              class="strat-card"
              [class.selected]="s.id === selectedId()"
              (click)="select(s.id)"
            >
              <div class="strat-top">
                <span class="tier" [class]="tierClass(s.tier)">{{ tierGlyph(s.tier) }}</span>
                <span class="name">{{ s.name }}</span>
                @if (s.id === selectedId()) {
                  <span class="selected-chip">Selected</span>
                }
              </div>
              <p class="strat-def">{{ s.definition }}</p>
              <div class="shape" aria-hidden="true">
                @for (cell of shapePreview(s); track cell.round) {
                  <div class="shape-cell">
                    <span class="shape-pos" [class]="cell.pos">{{ cell.pos }}</span>
                    <span class="shape-rd">{{ cell.round }}</span>
                  </div>
                }
              </div>
              <div
                class="fit-row"
                [class.warn]="fitTone(s) === 'warn'"
                [class.muted]="fitTone(s) === 'muted'"
              >
                <span class="fit-dot" aria-hidden="true"></span>
                <span>{{ fitLabel(s) }}</span>
              </div>
            </button>
          }
        </section>

        <section class="compare">
          <div class="compare-head">
            <h3>
              Compare strategies from pick
              {{ formatSlot(compare()?.slot ?? slot()) }}
            </h3>
            <span class="sim-chip">Simulated</span>
          </div>
          <p class="compare-sub">
            Simulated, not measured ·
            @if (compare(); as c) {
              {{ c.iterations }} Monte Carlo drafts per strategy
            } @else {
              run after strategies load
            }
          </p>

          @if (cmpLoading()) {
            <p class="empty">Running comparison…</p>
          } @else if (compareBars(); as bars) {
            <div class="bars">
              @for (bar of bars; track bar.strategyId) {
                <div class="bar-row">
                  <span class="bar-name">{{ bar.name }}</span>
                  <div class="bar-track">
                    <span
                      class="bar-fill"
                      [class.best]="bar.best"
                      [style.width.%]="bar.topThirdRate * 100"
                    ></span>
                  </div>
                  <span class="bar-meta">{{ (bar.topThirdRate * 100).toFixed(0) }}% top-3</span>
                </div>
              }
            </div>
          } @else {
            <p class="empty">Comparison unavailable for this league yet.</p>
          }
        </section>
      </div>

      <aside class="side">
        <section class="panel">
          <div class="panel-head">
            <h3>Your draft slot</h3>
            <span class="pick-chip">Pick {{ formatSlot(slot()) }}</span>
          </div>
          <div class="slot-grid" role="listbox" aria-label="Draft slot">
            @for (info of slotInfos(); track info.slot) {
              <button
                type="button"
                class="slot-btn"
                role="option"
                [attr.aria-selected]="info.slot === slot()"
                [class.active]="info.slot === slot()"
                (click)="selectSlot(info.slot)"
              >
                {{ formatSlot(info.slot) }}
                <span class="tier" [class]="tierClass(info.tier)">{{ tierGlyph(info.tier) }}</span>
              </button>
            }
          </div>
          <p class="slot-note">
            The shape here surprises most people: the back of the round (1.08–1.11) grades better
            than the middle (1.06–1.07), because turn picks let you take two players from the same
            tier while a mid-round slot waits through two full rounds of runs with no leverage.
            Slot 1.05 is cropped out of the source image, so it is shown unrated rather than guessed.
          </p>
          <button type="button" class="save-btn" [disabled]="saving()" (click)="save()">
            {{ saving() ? 'Saving…' : 'Set as league strategy' }}
          </button>
          @if (savedMsg()) {
            <p class="save-msg" role="status">{{ savedMsg() }}</p>
          }
        </section>

        <section class="panel">
          <div class="panel-head">
            <h3>Round plan · {{ selected()?.name ?? 'Strategy' }}</h3>
            <span class="plan-meta">% became league-winners</span>
          </div>
          @if (selected(); as s) {
            <table class="plan-table">
              <thead>
                <tr>
                  <th>RD</th>
                  <th>QB</th>
                  <th>RB</th>
                  <th>WR</th>
                  <th>TE</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                @for (row of roundPlan(s); track row.round) {
                  <tr>
                    <td class="rd">R{{ row.round }}</td>
                    @for (pos of positions; track pos) {
                      <td>
                        <span class="rate" [class]="rateTone(row.rates[pos])">{{
                          formatRate(row.rates[pos])
                        }}</span>
                      </td>
                    }
                    <td>
                      <div class="targets">
                        @for (p of row.targets; track p) {
                          <span class="target" [class]="p">{{ p }}</span>
                        }
                        @for (p of row.avoids; track p) {
                          <span class="target avoid">× {{ p }}</span>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        <aside class="callout" role="note">
          <h3>Do not take a tight end in round 4</h3>
          <p>
            Round 2 TEs became league-winners 43% of the time and round 3 TEs 25%, but round 4 TEs
            0%, with a second 20% spike in round 10. Pay early or wait — never round 4.
          </p>
        </aside>
      </aside>
    </div>
  `,
  styleUrl: './strategy.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StrategyComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly positions = POSITIONS;
  leagueId = '';

  readonly strategies = signal<StrategyDefinition[]>([]);
  readonly selectedId = signal('balanced');
  readonly slot = signal(9);
  readonly slotInfos = signal<DraftSlotInfo[]>([]);
  readonly compare = signal<CompareStrategiesResult | null>(null);
  readonly cmpLoading = signal(false);
  readonly saving = signal(false);
  readonly savedMsg = signal<string | null>(null);

  readonly selected = computed(
    () => this.strategies().find((s) => s.id === this.selectedId()) ?? null,
  );

  readonly compareBars = computed((): CompareBar[] | null => {
    const c = this.compare();
    if (!c?.ranking?.length) return null;
    const ranked = c.ranking.slice(0, 4);
    return ranked.map((r, i) => ({
      strategyId: r.strategyId,
      name: this.strategies().find((s) => s.id === r.strategyId)?.name ?? r.strategyId,
      topThirdRate: r.topThirdRate,
      meanRosterScore: r.meanRosterScore,
      best: i === 0,
    }));
  });

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';

    forkJoin({
      strategies: this.api.strategies(),
      slots: this.api.draftSlots(),
      league: this.api.league(this.leagueId),
    }).subscribe(({ strategies, slots, league }) => {
      this.strategies.set(strategies);
      this.slotInfos.set(slots.length ? slots : defaultSlots());
      this.applyLeague(league);
      this.runCompare();
    });
  }

  select(id: string) {
    this.selectedId.set(id);
    this.savedMsg.set(null);
  }

  selectSlot(slot: number) {
    this.slot.set(slot);
    this.savedMsg.set(null);
    this.runCompare();
  }

  save() {
    this.saving.set(true);
    this.savedMsg.set(null);
    this.api
      .updateLeague(this.leagueId, { strategyId: this.selectedId(), draftSlot: this.slot() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.savedMsg.set('Strategy and draft slot saved for this league.');
        },
        error: () => {
          this.saving.set(false);
          this.savedMsg.set('Could not save — try again.');
        },
      });
  }

  shapePreview(s: StrategyDefinition): Array<{ round: number; pos: Position }> {
    return s.rounds.slice(0, 6).map((r) => ({
      round: r.round,
      pos: (r.primary[0] ?? 'WR') as Position,
    }));
  }

  roundPlan(s: StrategyDefinition): RoundPlanRow[] {
    return PLAN_ROUNDS.map((round) => {
      const plan = s.rounds.find((r) => r.round === round);
      const rates = {} as Record<Position, number | null>;
      for (const pos of POSITIONS) {
        const value = ROUND_WINNER_RATES[round]?.[pos];
        rates[pos] = value === undefined ? null : value;
      }
      return {
        round,
        rates,
        targets: plan?.primary ?? [],
        avoids: plan?.avoid ?? [],
      };
    });
  }

  fitLabel(s: StrategyDefinition): string {
    const pick = this.formatSlot(this.slot());
    if (s.tier === 'unrated') return 'Tier not shown in source data';
    if (s.tier === 'C' || s.id === 'robust_rb' || s.id === 'double_hero_wr') {
      return `Hard to execute from ${pick}`;
    }
    if (s.tier === 'S' || s.tier === 'A') return `Strong from ${pick}`;
    return `Viable from ${pick}`;
  }

  fitTone(s: StrategyDefinition): 'ok' | 'warn' | 'muted' {
    if (s.tier === 'unrated') return 'muted';
    if (s.tier === 'C' || s.id === 'robust_rb' || s.id === 'double_hero_wr') return 'warn';
    return 'ok';
  }

  formatSlot(slot: number): string {
    return `1.${String(slot).padStart(2, '0')}`;
  }

  formatRate(rate: number | null): string {
    if (rate == null) return '—';
    return `${Math.round(rate * 100)}%`;
  }

  rateTone(rate: number | null): string {
    if (rate == null) return 'none';
    if (rate <= 0) return 'low';
    if (rate >= 0.2) return 'high';
    return 'mid';
  }

  tierClass(tier: StrategyTier): string {
    return tier === 'unrated' ? 'unrated' : tier;
  }

  tierGlyph(tier: StrategyTier): string {
    return tier === 'unrated' ? '–' : tier;
  }

  private applyLeague(league: League) {
    if (league.strategyId) this.selectedId.set(league.strategyId);
    if (league.draftSlot) this.slot.set(league.draftSlot);
  }

  private runCompare() {
    if (!this.leagueId) return;
    this.cmpLoading.set(true);
    const ids = this.strategies()
      .filter((s) => s.tier === 'S' || s.tier === 'A' || s.tier === 'B')
      .map((s) => s.id)
      .slice(0, 6);
    this.api
      .compareStrategies(this.leagueId, {
        strategyIds: ids.length ? ids : ['balanced', 'hero_wr', 'double_hero_rb', 'elite_te'],
        iterations: 150,
        rounds: 8,
      })
      .subscribe({
        next: (r) => {
          // Slot is saved on the league for compare; refresh after slot change uses league slot.
          // If API uses league draftSlot, update league first for accuracy — for UI we show bars as returned.
          this.compare.set(r);
          this.cmpLoading.set(false);
        },
        error: () => {
          this.compare.set(null);
          this.cmpLoading.set(false);
        },
      });
  }
}

function defaultSlots(): DraftSlotInfo[] {
  const tiers: StrategyTier[] = [
    'S',
    'S',
    'A',
    'A',
    'unrated',
    'C',
    'C',
    'A',
    'A',
    'B',
    'B',
    'C',
  ];
  return tiers.map((tier, i) => ({
    slot: i + 1,
    tier,
    pickNumbers: [],
  }));
}

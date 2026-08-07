import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { ApiService } from '../../core/api.service';
import type {
  CompareStrategiesResult,
  DraftSlotInfo,
  League,
  StrategyDefinition,
  StrategySimResult,
} from '../../core/api.types';

@Component({
  selector: 'app-strategy',
  imports: [FormsModule, Button, Select, SelectButton],
  template: `
    <h1>Strategy planner</h1>
    <p class="lede dl-muted">Balanced is S-tier and the default. Simulate and compare before you commit.</p>

    <p-selectbutton
      class="tabs"
      [options]="tabOptions"
      [ngModel]="tab()"
      (ngModelChange)="tab.set($event)"
      optionLabel="label"
      optionValue="value"
    />

    @if (tab() === 'plan') {
      <div class="grid">
        <div class="list">
          @for (s of strategies(); track s.id) {
            <button type="button" class="dl-panel strat" [class.active]="s.id === selectedId()" (click)="select(s.id)">
              <div class="top">
                <strong>{{ s.name }}</strong>
                <span class="tier" [class]="s.tier">{{ s.tier === 'unrated' ? '?' : s.tier }}</span>
              </div>
              <p>{{ s.definition }}</p>
            </button>
          }
        </div>

        <aside class="dl-panel detail">
          @if (selected(); as s) {
            <h2>{{ s.name }} plan</h2>
            <div class="controls">
              <label>
                Draft slot
                <p-select
                  [options]="slots()"
                  [(ngModel)]="slot"
                  optionLabel="label"
                  optionValue="value"
                  (ngModelChange)="onSlot()"
                />
              </label>
              <p-button label="Set as league strategy" (onClick)="save()" />
            </div>
            @if (slotInfo(); as info) {
              <p class="dl-muted">
                Slot {{ info.slot }} · tier <span class="tier" [class]="info.tier">{{ info.tier }}</span>
                · picks {{ info.pickNumbers.slice(0, 6).join(', ') }}…
              </p>
            }
            <div class="rounds">
              @for (r of s.rounds.slice(0, 10); track r.round) {
                <div class="round">
                  <div class="rn dl-mono">R{{ r.round }}</div>
                  <div>
                    <div class="tags">
                      @for (p of r.primary; track p) {
                        <span class="pos" [class]="p">{{ p }}</span>
                      }
                      @for (p of r.avoid; track p) {
                        <span class="avoid">avoid {{ p }}</span>
                      }
                    </div>
                    <div class="note dl-muted">{{ r.note }}</div>
                  </div>
                </div>
              }
            </div>
          }
        </aside>
      </div>
    }

    @if (tab() === 'simulate') {
      <section class="dl-panel sim">
        <div class="controls">
          <label>
            Strategy
            <p-select [options]="strategyOptions()" [(ngModel)]="simStrategyId" optionLabel="label" optionValue="value" />
          </label>
          <p-button label="Run 200 sims" [loading]="simLoading()" (onClick)="runSim()" />
        </div>
        @if (sim(); as s) {
          <div class="stats">
            <div><span class="label">Mean roster score</span><strong class="dl-mono">{{ s.meanRosterScore }}</strong></div>
            <div><span class="label">Median</span><strong class="dl-mono">{{ s.medianRosterScore }}</strong></div>
            <div><span class="label">Upper-tercile share</span><strong class="dl-mono">{{ (s.topThirdRate * 100).toFixed(0) }}%</strong></div>
          </div>
          <div class="mix">
            @for (pos of posList; track pos) {
              <div class="mix-row">
                <span class="pos" [class]="pos">{{ pos }}</span>
                <div class="bar"><span [style.width.%]="s.positionMix[pos] * 100"></span></div>
                <span class="dl-mono">{{ (s.positionMix[pos] * 100).toFixed(0) }}%</span>
              </div>
            }
          </div>
          <p class="assume dl-muted">{{ s.assumptions.note }} σ ratio {{ s.assumptions.adpVarianceRatio }}, floor {{ s.assumptions.adpVarianceFloor }} picks · {{ s.assumptions.rounds }} rounds · {{ s.iterations }} iters</p>
          @if (s.sampleRosters[0]; as sample) {
            <div class="sample">
              <h3>Sample roster</h3>
              <p>{{ sample.playerNames.join(' · ') }}</p>
            </div>
          }
        }
      </section>
    }

    @if (tab() === 'compare') {
      <section class="dl-panel sim">
        <div class="controls">
          <p-button label="Compare top strategies" [loading]="cmpLoading()" (onClick)="runCompare()" />
        </div>
        @if (compare(); as c) {
          <table class="cmp">
            <thead>
              <tr><th>Rank</th><th>Strategy</th><th>Mean score</th><th>Upper tercile</th></tr>
            </thead>
            <tbody>
              @for (r of c.ranking; track r.strategyId) {
                <tr>
                  <td class="dl-mono">{{ r.rank }}</td>
                  <td>{{ strategyName(r.strategyId) }}</td>
                  <td class="dl-mono accent">{{ r.meanRosterScore }}</td>
                  <td class="dl-mono">{{ (r.topThirdRate * 100).toFixed(0) }}%</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="assume dl-muted">Same slot ({{ c.slot }}), {{ c.iterations }} iterations each. Relative ranking — not win probability.</p>
        }
      </section>
    }
  `,
  styles: `
    h1 { margin: 0 0 0.25rem; }
    .lede { margin: 0 0 1rem; }
    .tabs { margin-bottom: 1rem; display: inline-flex; }
    .grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 1rem; align-items: start; }
    .list { display: grid; gap: 0.6rem; }
    .strat {
      text-align: left; padding: 0.9rem 1rem; cursor: pointer; color: inherit;
      border: 1px solid var(--dl-border-subtle); background: var(--dl-surface-raised);
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .strat:hover { transform: translateY(-1px); border-color: var(--dl-border-strong); }
    .strat.active { border-color: var(--dl-accent); box-shadow: inset 3px 0 0 var(--dl-accent); }
    .strat .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; }
    .strat p { margin: 0; color: var(--dl-text-secondary); font-size: 0.85rem; line-height: 1.4; }
    .detail, .sim { padding: 1.1rem; }
    .detail { position: sticky; top: 4.5rem; }
    h2, h3 { margin: 0 0 0.75rem; }
    .controls { display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap; margin-bottom: 0.75rem; }
    label { display: grid; gap: 0.35rem; font-size: 0.8rem; color: var(--dl-text-secondary); }
    .rounds { display: grid; gap: 0.65rem; margin-top: 1rem; }
    .round { display: grid; grid-template-columns: 2.5rem 1fr; gap: 0.6rem; }
    .rn { color: var(--dl-text-tertiary); font-weight: 600; padding-top: 0.15rem; }
    .tags { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.2rem; }
    .avoid {
      font-size: 0.7rem; color: var(--dl-grade-red);
      background: var(--dl-grade-red-fill); padding: 0.15rem 0.4rem; border-radius: 4px;
    }
    .note { font-size: 0.8rem; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin: 1rem 0; }
    .stats .label { display: block; color: var(--dl-text-tertiary); font-size: 0.75rem; margin-bottom: 0.2rem; }
    .mix { display: grid; gap: 0.45rem; }
    .mix-row { display: grid; grid-template-columns: 2.2rem 1fr 3rem; gap: 0.5rem; align-items: center; }
    .bar { height: 0.45rem; background: var(--dl-surface-sunken); border-radius: 99px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--dl-accent); }
    .assume { font-size: 0.8rem; margin-top: 1rem; line-height: 1.4; }
    .sample p { margin: 0; color: var(--dl-text-secondary); font-size: 0.9rem; }
    .cmp { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    .cmp th, .cmp td { text-align: left; padding: 0.55rem 0.4rem; border-bottom: 1px solid var(--dl-border-subtle); }
    .accent { color: var(--dl-accent); font-weight: 700; }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      .detail { position: static; }
      .stats { grid-template-columns: 1fr; }
    }
  `,
})
export class StrategyComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  leagueId = 'demo-league';
  readonly strategies = signal<StrategyDefinition[]>([]);
  readonly selectedId = signal('balanced');
  readonly slots = signal<Array<{ label: string; value: number }>>([]);
  readonly slotInfo = signal<DraftSlotInfo | null>(null);
  readonly tab = signal<'plan' | 'simulate' | 'compare'>('plan');
  readonly sim = signal<StrategySimResult | null>(null);
  readonly compare = signal<CompareStrategiesResult | null>(null);
  readonly simLoading = signal(false);
  readonly cmpLoading = signal(false);
  slot = 3;
  simStrategyId = 'balanced';
  readonly posList = ['QB', 'RB', 'WR', 'TE'] as const;
  readonly tabOptions = [
    { label: 'Plan', value: 'plan' },
    { label: 'Simulate', value: 'simulate' },
    { label: 'Compare', value: 'compare' },
  ];

  selected() {
    return this.strategies().find((s) => s.id === this.selectedId()) ?? null;
  }

  strategyOptions() {
    return this.strategies().map((s) => ({ label: `${s.name} (${s.tier})`, value: s.id }));
  }

  strategyName(id: string) {
    return this.strategies().find((s) => s.id === id)?.name ?? id;
  }

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? 'demo-league';
    this.api.strategies().subscribe((s) => {
      this.strategies.set(s);
      this.simStrategyId = this.selectedId();
    });
    this.api.draftSlots().subscribe((slots) => {
      this.slots.set(slots.map((x) => ({ label: `1.${String(x.slot).padStart(2, '0')} (${x.tier})`, value: x.slot })));
      this.slotInfo.set(slots.find((x) => x.slot === this.slot) ?? null);
    });
    this.api.league(this.leagueId).subscribe((l: League) => {
      if (l.strategyId) {
        this.selectedId.set(l.strategyId);
        this.simStrategyId = l.strategyId;
      }
      if (l.draftSlot) {
        this.slot = l.draftSlot;
        this.onSlot();
      }
    });
  }

  select(id: string) {
    this.selectedId.set(id);
    this.simStrategyId = id;
  }

  onSlot() {
    this.api.draftSlots().subscribe((slots) => {
      this.slotInfo.set(slots.find((x) => x.slot === this.slot) ?? null);
    });
  }

  save() {
    this.api.updateLeague(this.leagueId, { strategyId: this.selectedId(), draftSlot: this.slot }).subscribe();
  }

  runSim() {
    this.simLoading.set(true);
    this.api.simulate(this.leagueId, { strategyId: this.simStrategyId, iterations: 200, rounds: 8 }).subscribe({
      next: (r) => {
        this.sim.set(r);
        this.simLoading.set(false);
      },
      error: () => this.simLoading.set(false),
    });
  }

  runCompare() {
    this.cmpLoading.set(true);
    this.api
      .compareStrategies(this.leagueId, {
        strategyIds: ['balanced', 'hero_wr', 'double_hero_rb', 'elite_te', 'zero_rb', 'robust_rb'],
        iterations: 150,
        rounds: 8,
      })
      .subscribe({
        next: (r) => {
          this.compare.set(r);
          this.cmpLoading.set(false);
        },
        error: () => this.cmpLoading.set(false),
      });
  }
}

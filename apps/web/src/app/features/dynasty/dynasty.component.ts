import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { DynastyOverview } from '../../core/api.types';

@Component({
  selector: 'app-dynasty',
  imports: [RouterLink],
  template: `
    <a class="back" [routerLink]="['/']">← Dashboard</a>
    <div class="head">
      <div>
        <h1>Dynasty room</h1>
        <p class="lede dl-muted">Multi-year curves, pick assets, roster age, and contend vs rebuild weighting.</p>
      </div>
      <div class="modes">
        @for (m of modes; track m) {
          <button type="button" class="mode" [class.active]="overview()?.mode === m" (click)="setMode(m)">
            {{ m }}
          </button>
        }
      </div>
    </div>

    @if (overview(); as o) {
      <div class="grid">
        <section class="dl-panel">
          <h2>Roster age curve</h2>
          <div class="kv"><span>Mean age</span><strong class="dl-mono">{{ o.ageCurve.meanAge }}</strong></div>
          <div class="kv"><span>Median</span><strong class="dl-mono">{{ o.ageCurve.medianAge }}</strong></div>
          <div class="kv"><span>Contend score</span><strong class="accent dl-mono">{{ o.ageCurve.contendScore }}</strong></div>
          <div class="kv"><span>Rebuild score</span><strong class="dl-mono">{{ o.ageCurve.rebuildScore }}</strong></div>
          <div class="bars">
            @for (b of o.ageCurve.buckets; track b.label) {
              <div class="bar-row">
                <span>{{ b.label }}</span>
                <div class="bar"><i [style.width.%]="barWidth(b.count)"></i></div>
                <span class="dl-mono">{{ b.count }}</span>
              </div>
            }
          </div>
        </section>

        <section class="dl-panel">
          <h2>Draft pick assets</h2>
          <div class="kv"><span>Owned pick value</span><strong class="accent dl-mono">{{ o.ownedPickValue }}</strong></div>
          <div class="list">
            @for (p of o.pickAssets; track p.id) {
              <div class="row">
                <span>{{ p.label }}</span>
                <span class="dl-muted">{{ p.ownerRosterId === 'roster-user' ? 'yours' : 'elsewhere' }}</span>
                <span class="dl-mono">{{ p.estimatedValue }}</span>
              </div>
            }
          </div>
        </section>

        <section class="dl-panel wide">
          <h2>Dynasty board <span class="dl-muted">(mode: {{ o.mode }})</span></h2>
          <div class="table">
            @for (r of o.board.slice(0, 18); track r.playerId) {
              <a class="row" [routerLink]="['/leagues', leagueId, 'board', r.playerId]">
                <span class="pos" [class]="r.position">{{ r.position }}</span>
                <span class="name">{{ r.name }} <span class="dl-muted">{{ r.age }}y · {{ r.archetype }}</span></span>
                <span class="dl-mono">NPV {{ r.npv }}</span>
                <span class="dl-mono accent">{{ r.dynastyScore }}</span>
              </a>
              <div class="spark">
                @for (pt of r.curve.points; track pt.yearOffset) {
                  <span [style.height.%]="spark(pt.value, r.curve)" [title]="pt.season + ': ' + pt.value"></span>
                }
              </div>
            }
          </div>
        </section>

        <section class="dl-panel wide">
          <h2>Rookie board</h2>
          @if (!o.rookieBoard.length) {
            <p class="dl-muted">No rookies in the seed set for this season.</p>
          }
          <div class="table">
            @for (r of o.rookieBoard; track r.playerId) {
              <div class="row">
                <span class="pos" [class]="r.position">{{ r.position }}</span>
                <span class="name">{{ r.name }} <span class="dl-muted">Rd {{ r.draftRound ?? '—' }} · {{ r.note }}</span></span>
                <span class="dl-mono">NPV {{ r.npv }}</span>
                <span class="dl-mono accent">{{ r.dynastyScore }}</span>
              </div>
            }
          </div>
        </section>
      </div>
    }
  `,
  styles: `
    .back { color: var(--dl-text-secondary); font-size: 0.85rem; }
    .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; margin: 0.5rem 0 1.25rem; }
    h1 { margin: 0 0 0.25rem; }
    .lede { margin: 0; }
    .modes { display: flex; gap: 0.35rem; }
    .mode {
      border: 1px solid var(--dl-border-subtle);
      background: transparent;
      color: var(--dl-text-secondary);
      padding: 0.45rem 0.75rem;
      border-radius: var(--dl-radius-sm);
      cursor: pointer;
      text-transform: capitalize;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .mode.active, .mode:hover { background: var(--dl-accent-dim); color: var(--dl-accent); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .wide { grid-column: 1 / -1; }
    .dl-panel { padding: 1rem; }
    h2 { margin: 0 0 0.75rem; font-size: 1rem; }
    .kv { display: flex; justify-content: space-between; gap: 1rem; padding: 0.35rem 0; border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.9rem; }
    .accent { color: var(--dl-accent); }
    .bars { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem; }
    .bar-row { display: grid; grid-template-columns: 3.5rem 1fr 1.5rem; gap: 0.5rem; align-items: center; font-size: 0.8rem; }
    .bar { height: 0.45rem; background: var(--dl-surface-overlay); border-radius: 99px; overflow: hidden; }
    .bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--dl-accent), #0ea5a0); animation: grow 0.6s ease both; }
    .list, .table { display: flex; flex-direction: column; gap: 0.15rem; }
    .row {
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      gap: 0.75rem;
      align-items: center;
      padding: 0.4rem 0;
      border-bottom: 1px solid var(--dl-border-subtle);
      font-size: 0.88rem;
      color: inherit;
    }
    .name { min-width: 0; }
    .spark {
      display: flex; align-items: flex-end; gap: 3px; height: 28px; margin: -0.1rem 0 0.35rem 2.2rem;
    }
    .spark span {
      width: 10px; background: color-mix(in srgb, var(--dl-accent) 70%, transparent);
      border-radius: 2px 2px 0 0; min-height: 15%;
      animation: grow 0.5s ease both;
    }
    @keyframes grow { from { transform: scaleY(0.2); opacity: 0.4; } to { transform: scaleY(1); opacity: 1; } }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      .wide { grid-column: auto; }
      .row { grid-template-columns: auto 1fr; }
      .row .dl-mono:last-child { grid-column: 2; }
    }
  `,
})
export class DynastyComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  leagueId = 'demo-dynasty';
  readonly modes = ['contend', 'neutral', 'rebuild'] as const;
  readonly overview = signal<DynastyOverview | null>(null);

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? 'demo-dynasty';
    this.reload();
  }

  setMode(mode: 'contend' | 'neutral' | 'rebuild') {
    this.api.setDynastyMode(this.leagueId, mode).subscribe((o) => this.overview.set(o));
  }

  barWidth(count: number) {
    return Math.min(100, count * 18);
  }

  spark(value: number, curve: DynastyOverview['board'][number]['curve']) {
    const max = Math.max(...curve.points.map((p) => p.value), 1);
    return Math.max(12, (value / max) * 100);
  }

  private reload() {
    this.api.dynasty(this.leagueId).subscribe((o) => this.overview.set(o));
  }
}

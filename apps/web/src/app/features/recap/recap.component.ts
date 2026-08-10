import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { DraftRecap } from '../../core/api.types';

@Component({
  selector: 'app-recap',
  imports: [RouterLink],
  template: `
    <a class="back" [routerLink]="['/leagues', leagueId, 'draft']">← Draft room</a>
    <h1>Post-draft recap</h1>
    <p class="lede dl-muted">
      Roster grade, strategy adherence, and the calibration log for what you took vs the model.
      <a [routerLink]="['/leagues', leagueId, 'calibration']">Open calibration →</a>
    </p>

    @if (recap(); as r) {
      <div class="grid">
        <section class="dl-panel">
          <h2>Overview</h2>
          <div class="kv"><span>Strategy</span><strong>{{ r.strategyId }}</strong></div>
          <div class="kv"><span>Mean DraftScore</span><strong class="dl-mono accent">{{ r.meanDraftScore }}</strong></div>
          <div class="kv"><span>Adherence</span><strong>{{ r.adherence.score }}% · {{ r.adherence.state.replaceAll('_', ' ') }}</strong></div>
          @if (r.bestValue) {
            <div class="kv"><span>Best value</span><strong>{{ r.bestValue.name }} ({{ r.bestValue.valueScore > 0 ? '+' : '' }}{{ r.bestValue.valueScore }})</strong></div>
          }
          @if (r.worstValue) {
            <div class="kv"><span>Worst value</span><strong>{{ r.worstValue.name }} ({{ r.worstValue.valueScore }})</strong></div>
          }
        </section>
        <section class="dl-panel">
          <h2>Weaknesses</h2>
          @if (!r.weaknesses.length) {
            <p class="dl-muted">No glaring holes detected.</p>
          }
          <ul>
            @for (w of r.weaknesses; track w) {
              <li>{{ w }}</li>
            }
          </ul>
        </section>
        <section class="dl-panel wide">
          <h2>Roster by position</h2>
          <div class="pos-grid">
            @for (pos of positions; track pos) {
              <div>
                <h3><span class="pos" [class]="pos">{{ pos }}</span></h3>
                @for (p of r.rosterByPosition[pos]; track p.id) {
                  <div class="row">
                    <span>{{ p.name }}</span>
                    <span class="dl-mono">#{{ p.pickNumber }} · {{ p.draftScore }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </section>
      </div>
    }
  `,
  styles: `
    .back { color: var(--dl-text-secondary); font-size: 0.85rem; }
    h1 { margin: 0.5rem 0 0.25rem; }
    .lede { margin: 0 0 1.25rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .wide { grid-column: 1 / -1; }
    .dl-panel { padding: 1rem; }
    h2 { margin: 0 0 0.75rem; font-size: 1rem; }
    h3 { margin: 0 0 0.4rem; }
    .kv { display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0; border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.9rem; }
    .accent { color: var(--dl-accent); }
    ul { margin: 0; padding-left: 1.1rem; }
    .pos-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .row { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.85rem; padding: 0.25rem 0; border-bottom: 1px solid var(--dl-border-subtle); }
    @media (max-width: 900px) {
      .grid, .pos-grid { grid-template-columns: 1fr; }
      .wide { grid-column: auto; }
    }
  `,
})
export class RecapComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  leagueId = '';
  readonly recap = signal<DraftRecap | null>(null);
  readonly positions = ['QB', 'RB', 'WR', 'TE'];

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.recap(this.leagueId).subscribe((r) => this.recap.set(r));
  }
}

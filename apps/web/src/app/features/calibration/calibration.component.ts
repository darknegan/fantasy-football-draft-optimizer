import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { CalibrationProposal, CalibrationSummary } from '../../core/api.types';

@Component({
  selector: 'app-calibration',
  imports: [RouterLink],
  template: `
    <a class="back" [routerLink]="['/leagues', leagueId, 'recap']">← Recap</a>
    <h1>Model calibration</h1>
    <p class="lede dl-muted">
      Outcome tracking, recommendation vs actual, and proposed grading-band / DraftScore weight updates.
    </p>

    @if (summary(); as s) {
      <div class="grid">
        <section class="dl-panel">
          <h2>Active config</h2>
          <div class="kv"><span>Ceiling weight</span><strong class="dl-mono">{{ s.activeWeights.ceiling }}</strong></div>
          <div class="kv"><span>Archetype</span><strong class="dl-mono">{{ s.activeWeights.archetype }}</strong></div>
          <div class="kv"><span>Value</span><strong class="dl-mono">{{ s.activeWeights.value }}</strong></div>
          <div class="kv"><span>Risk</span><strong class="dl-mono">{{ s.activeWeights.risk }}</strong></div>
          <div class="kv"><span>Elite band ≥</span><strong class="dl-mono">{{ s.activeBands.eliteMin }}</strong></div>
          <div class="kv"><span>Green band ≥</span><strong class="dl-mono">{{ s.activeBands.greenMin }}</strong></div>
          <div class="kv"><span>Red band ≥</span><strong class="dl-mono">{{ s.activeBands.redMin }}</strong></div>
        </section>

        <section class="dl-panel">
          <h2>Sample</h2>
          <div class="kv"><span>Outcomes logged</span><strong class="dl-mono">{{ s.outcomes.length }}</strong></div>
          @if (s.proposal; as p) {
            <div class="kv"><span>Follow rate</span><strong class="dl-mono accent">{{ pct(p.followRate) }}</strong></div>
            <div class="kv"><span>Mean rank delta</span><strong class="dl-mono">{{ p.meanRankDelta }}</strong></div>
          }
          <div class="actions">
            <button type="button" class="btn" (click)="propose()">Propose recalibration</button>
            <button type="button" class="btn primary" (click)="apply()" [disabled]="!proposal()">Apply proposal</button>
          </div>
        </section>

        @if (proposal(); as p) {
          <section class="dl-panel wide">
            <h2>Proposal {{ p.version }} @if (p.applied) { <span class="tag">applied</span> }</h2>
            <ul>
              @for (n of p.notes; track n) {
                <li>{{ n }}</li>
              }
            </ul>
            <div class="compare">
              <div>
                <h3>Weights</h3>
                <div class="kv"><span>Ceiling</span><span class="dl-mono">{{ p.currentWeights.ceiling }} → {{ p.proposedWeights.ceiling }}</span></div>
                <div class="kv"><span>Archetype</span><span class="dl-mono">{{ p.currentWeights.archetype }} → {{ p.proposedWeights.archetype }}</span></div>
                <div class="kv"><span>Value</span><span class="dl-mono">{{ p.currentWeights.value }} → {{ p.proposedWeights.value }}</span></div>
                <div class="kv"><span>Risk</span><span class="dl-mono">{{ p.currentWeights.risk }} → {{ p.proposedWeights.risk }}</span></div>
              </div>
              <div>
                <h3>Bands</h3>
                <div class="kv"><span>Elite</span><span class="dl-mono">{{ p.currentBands.eliteMin }} → {{ p.proposedBands.eliteMin }}</span></div>
                <div class="kv"><span>Green</span><span class="dl-mono">{{ p.currentBands.greenMin }} → {{ p.proposedBands.greenMin }}</span></div>
                <div class="kv"><span>Yellow</span><span class="dl-mono">{{ p.currentBands.yellowMin }} → {{ p.proposedBands.yellowMin }}</span></div>
                <div class="kv"><span>Orange</span><span class="dl-mono">{{ p.currentBands.orangeMin }} → {{ p.proposedBands.orangeMin }}</span></div>
                <div class="kv"><span>Red</span><span class="dl-mono">{{ p.currentBands.redMin }} → {{ p.proposedBands.redMin }}</span></div>
              </div>
            </div>
          </section>
        }

        <section class="dl-panel wide">
          <h2>Rec vs actual</h2>
          @if (!s.rows.length) {
            <p class="dl-muted">No outcomes yet — make draft picks to start the log.</p>
          }
          <div class="table">
            @for (r of s.rows; track r.pickNumber) {
              <div class="row" [class.ok]="r.followed">
                <span class="dl-mono">#{{ r.pickNumber }}</span>
                <span>Rec: {{ r.recommendedName ?? '—' }}</span>
                <span>Took: {{ r.actualName }}</span>
                <span class="dl-mono">Δ {{ r.rankDelta ?? '—' }}</span>
                <span class="flag">{{ r.followed ? 'followed' : 'reached' }}</span>
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
    h3 { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--dl-text-secondary); }
    .kv { display: flex; justify-content: space-between; gap: 1rem; padding: 0.35rem 0; border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.9rem; }
    .accent { color: var(--dl-accent); }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
    .btn {
      background: var(--dl-surface-overlay); color: var(--dl-text-primary);
      border: 1px solid var(--dl-border-subtle); border-radius: var(--dl-radius-sm);
      padding: 0.5rem 0.75rem; cursor: pointer;
    }
    .btn.primary { background: var(--dl-accent-dim); color: var(--dl-accent); border-color: color-mix(in srgb, var(--dl-accent) 40%, transparent); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .tag { margin-left: 0.5rem; font-size: 0.7rem; color: var(--dl-live); text-transform: uppercase; }
    ul { margin: 0 0 1rem; padding-left: 1.1rem; color: var(--dl-text-secondary); }
    .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .row {
      display: grid; grid-template-columns: 3.5rem 1.2fr 1.2fr 3rem auto; gap: 0.75rem;
      padding: 0.4rem 0; border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.85rem;
    }
    .row.ok .flag { color: var(--dl-live); }
    .flag { text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; color: #f59e0b; }
    @media (max-width: 900px) {
      .grid, .compare { grid-template-columns: 1fr; }
      .wide { grid-column: auto; }
      .row { grid-template-columns: 1fr 1fr; }
    }
  `,
})
export class CalibrationComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  leagueId = '';
  readonly summary = signal<CalibrationSummary | null>(null);
  readonly proposal = signal<CalibrationProposal | null>(null);

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    this.reload();
  }

  pct(n: number) {
    return `${(n * 100).toFixed(1)}%`;
  }

  propose() {
    this.api.proposeCalibration(this.leagueId).subscribe((p) => {
      this.proposal.set(p);
      this.reload();
    });
  }

  apply() {
    this.api.applyCalibration(this.leagueId).subscribe((p) => {
      this.proposal.set(p);
      this.reload();
    });
  }

  private reload() {
    this.api.calibration(this.leagueId).subscribe((s) => {
      this.summary.set(s);
      if (s.proposal) this.proposal.set(s.proposal);
    });
  }
}

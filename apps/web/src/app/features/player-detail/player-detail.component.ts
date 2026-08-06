import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProgressBar } from 'primeng/progressbar';
import { ApiService } from '../../core/api.service';
import type { Player, PlayerEvaluation } from '../../core/api.types';

@Component({
  selector: 'app-player-detail',
  imports: [RouterLink, ProgressBar],
  template: `
    @if (player(); as p) {
      <a class="back" [routerLink]="['/leagues', leagueId, 'board']">← Board</a>
      <header class="head">
        <div>
          <div class="meta">
            <span class="pos" [class]="p.position">{{ p.position }}</span>
            <span class="dl-muted">{{ p.team }} · age {{ p.age }} · yr {{ p.seasonsInLeague }}</span>
          </div>
          <h1>{{ p.name }}</h1>
        </div>
        @if (evaluation(); as e) {
          <div class="scores">
            <div>
              <div class="label">Ceiling</div>
              <div class="big dl-mono">
                @if (e.ceiling.provisional) { — } @else { {{ e.ceiling.ceilingScore }} }
              </div>
            </div>
            <div>
              <div class="label">DraftScore</div>
              <div class="big dl-mono accent">{{ e.draftScore }}</div>
            </div>
          </div>
        }
      </header>

      @if (evaluation(); as e) {
        <div class="grid">
          <section class="dl-panel">
            <h2>Factor grades</h2>
            @if (e.ceiling.provisional) {
              <p class="dl-muted">RB CeilingScore is provisional until benchmarks land. Showing archetype + risk instead.</p>
            } @else {
              <div class="factors">
                @for (f of e.ceiling.factors; track f.factorId) {
                  <div class="factor">
                    <span class="grade" [class]="f.grade">{{ weightLabel(f.weight) }}</span>
                    <div>
                      <div>{{ f.label }}</div>
                      <div class="dl-muted small dl-mono">{{ f.value ?? '?' }} · {{ f.grade }}</div>
                    </div>
                  </div>
                }
              </div>
            }
          </section>
          <section class="dl-panel side">
            <h2>Profile</h2>
            <div class="kv"><span>Archetype</span><strong>{{ e.archetype.archetype.replaceAll('_', ' ') }}</strong></div>
            <div class="kv"><span>Archetype EV</span><strong class="dl-mono">{{ e.archetype.archetypeEv.toFixed(3) }}</strong></div>
            <div class="kv"><span>Value</span><strong class="dl-mono">{{ e.value.valueScore }}</strong></div>
            <div class="kv"><span>ADP</span><strong class="dl-mono">{{ e.value.adpRoundPick }}</strong></div>
            <div class="kv"><span>Risk</span><strong class="dl-mono">{{ e.risk.riskProfile }}</strong></div>
            <div class="risk">
              <div class="label">Risk profile</div>
              <p-progressbar [value]="e.risk.riskProfile" [showValue]="false" />
            </div>
            <div class="kv"><span>Confidence</span><strong class="dl-mono">{{ (e.ceiling.confidenceScore * 100).toFixed(0) }}%</strong></div>
          </section>
        </div>
      }
    }
  `,
  styles: `
    .back { color: var(--dl-text-secondary); font-size: 0.85rem; }
    .head { display: flex; justify-content: space-between; gap: 1rem; margin: 0.75rem 0 1.25rem; flex-wrap: wrap; }
    h1 { margin: 0.35rem 0 0; letter-spacing: -0.02em; }
    .meta { display: flex; gap: 0.6rem; align-items: center; }
    .scores { display: flex; gap: 1.5rem; }
    .label { color: var(--dl-text-tertiary); font-size: 0.75rem; }
    .big { font-size: 2rem; font-weight: 700; }
    .accent { color: var(--dl-accent); }
    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; }
    .dl-panel { padding: 1rem; }
    h2 { margin: 0 0 0.75rem; font-size: 1rem; }
    .factors { display: grid; gap: 0.55rem; }
    .factor { display: grid; grid-template-columns: 2.2rem 1fr; gap: 0.65rem; align-items: start; }
    .small { font-size: 0.75rem; }
    .kv { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.9rem; }
    .risk { margin-top: 1rem; display: grid; gap: 0.35rem; }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class PlayerDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  leagueId = 'demo-league';
  readonly player = signal<Player | null>(null);
  readonly evaluation = signal<PlayerEvaluation | null>(null);

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? 'demo-league';
    const pid = this.route.snapshot.paramMap.get('pid')!;
    this.api.player(pid).subscribe((res) => {
      this.player.set(res.player);
      this.evaluation.set(res.evaluation);
    });
  }

  weightLabel(w: number) {
    if (w > 0) return `+${w}`;
    return `${w}`;
  }
}

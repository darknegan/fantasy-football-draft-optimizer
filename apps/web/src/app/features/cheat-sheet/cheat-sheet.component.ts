import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { CheatSheetGroup } from '../../core/api.types';

@Component({
  selector: 'app-cheat-sheet',
  imports: [RouterLink],
  template: `
    <div class="head">
      <div>
        <h1>Tier cheat sheet</h1>
        <p class="dl-muted">DraftScore percentiles by position. Targets and avoids carry into the live room.</p>
      </div>
      <a class="link" [routerLink]="['/leagues', leagueId, 'board']">Open full board →</a>
    </div>

    <div class="grid">
      @for (group of groups(); track group.position) {
        <section class="dl-panel">
          <h2><span class="pos" [class]="group.position">{{ group.position }}</span> tiers</h2>
          @for (tier of group.tiers; track tier.tier) {
            <div class="tier-block">
              <div class="tier-head">
                <span class="tier" [class]="tier.tier">{{ tier.tier }}</span>
                <span class="dl-muted">{{ tier.label }}</span>
              </div>
              <div class="players">
                @for (p of tier.players; track p.id) {
                  <a
                    class="player"
                    [class.target]="p.target"
                    [class.avoid]="p.avoid"
                    [routerLink]="['/leagues', leagueId, 'board', p.id]"
                  >
                    <span class="name">{{ p.name }}</span>
                    <span class="meta dl-mono">
                      @if (p.provisional) { — } @else { {{ p.ceilingScore ?? '—' }} }
                      · {{ p.draftScore }}
                      · {{ p.adpRoundPick }}
                    </span>
                    @if (p.target) { <span class="flag t">T</span> }
                    @if (p.avoid) { <span class="flag a">A</span> }
                  </a>
                }
              </div>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; gap: 1rem; align-items: end; margin-bottom: 1rem; flex-wrap: wrap; }
    h1 { margin: 0 0 0.25rem; }
    .link { color: var(--dl-accent); font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .dl-panel { padding: 1rem; }
    h2 { margin: 0 0 0.75rem; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    .tier-block { margin-bottom: 0.85rem; }
    .tier-head { display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.35rem; }
    .players { display: grid; gap: 0.25rem; }
    .player {
      display: grid; grid-template-columns: 1fr auto auto; gap: 0.5rem; align-items: center;
      padding: 0.4rem 0.5rem; border-radius: 4px; border: 1px solid transparent;
    }
    .player:hover { background: var(--dl-surface-overlay); }
    .player.target { border-color: color-mix(in srgb, var(--dl-accent) 45%, transparent); }
    .player.avoid { border-color: color-mix(in srgb, var(--dl-grade-red) 45%, transparent); opacity: 0.75; }
    .name { font-weight: 600; font-size: 0.9rem; }
    .meta { color: var(--dl-text-tertiary); font-size: 0.75rem; }
    .flag {
      width: 1.1rem; height: 1.1rem; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center;
      font-size: 0.65rem; font-weight: 700;
    }
    .flag.t { background: var(--dl-accent-dim); color: var(--dl-accent); }
    .flag.a { background: var(--dl-grade-red-fill); color: var(--dl-grade-red); }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class CheatSheetComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  leagueId = 'demo-league';
  readonly groups = signal<CheatSheetGroup[]>([]);

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? 'demo-league';
    this.api.cheatSheet(this.leagueId).subscribe((g) => this.groups.set(g));
  }
}

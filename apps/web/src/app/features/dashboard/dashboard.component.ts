import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActiveLeagueService } from '../../core/active-league.service';
import { ApiService } from '../../core/api.service';
import type { BoardPlayer, League } from '../../core/api.types';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <section class="hero">
      <div>
        <p class="eyebrow">DraftLab</p>
        <h1>Build the board. Stick the plan. Win the draft.</h1>
        <p class="lede">
          Factor-graded player evaluation, nine research-backed strategies, and a live draft room
          that re-ranks as picks land — all scoped to your account.
        </p>
        <div class="cta">
          @if (active.selectedId(); as id) {
            <a class="btn primary" [routerLink]="['/leagues', id, 'board']">Open player board</a>
            <a class="btn ghost" [routerLink]="['/leagues', id, 'draft']">Live draft</a>
          } @else {
            <a class="btn primary" routerLink="/leagues/connect">Connect a league</a>
            <a class="btn ghost" routerLink="/leagues/manual-setup">Manual setup</a>
          }
        </div>
      </div>
      <div class="hero-panel dl-panel">
        <div class="stat">
          <span class="label">Verified ceilings</span>
          <span class="value dl-mono">Allen 41 · Chase 42 · Bowers 36</span>
        </div>
        <div class="stat">
          <span class="label">Your leagues</span>
          <span class="value">{{ leagues().length }}</span>
        </div>
        <div class="stat">
          <span class="label">RB CeilingScore</span>
          <span class="value">Provisional — benchmarks pending</span>
        </div>
      </div>
    </section>

    <section class="grid">
      <article class="dl-panel card">
        <h2>Your leagues</h2>
        @if (!leagues().length) {
          <p class="empty dl-muted">
            No leagues yet.
            <a routerLink="/leagues/connect">Connect Sleeper</a>
            or
            <a routerLink="/leagues/manual-setup">set one up manually</a>.
          </p>
        }
        @for (league of leagues(); track league.id) {
          <a class="league" [routerLink]="['/leagues', league.id, 'board']" (click)="active.select(league.id)">
            <div>
              <strong>{{ league.name }}</strong>
              <div class="dl-muted">
                {{ league.teamCount }}-team · {{ league.platform }} ·
                {{ league.type }} · slot {{ league.draftSlot ?? '—' }}
              </div>
            </div>
            <span class="chev">→</span>
          </a>
        }
      </article>

      <article class="dl-panel card">
        <h2>Top of the board</h2>
        @if (!active.selectedId()) {
          <p class="empty dl-muted">Select or connect a league to see ranked players.</p>
        }
        <div class="rows">
          @for (row of top(); track row.player.id) {
            <a class="row" [routerLink]="['/leagues', active.selectedId(), 'board', row.player.id]">
              <span class="pos" [class]="row.player.position">{{ row.player.position }}</span>
              <span class="name">{{ row.player.name }}</span>
              <span class="score dl-mono">
                @if (row.evaluation.ceiling.provisional) {
                  —
                } @else {
                  {{ row.evaluation.ceiling.ceilingScore ?? '—' }}
                }
              </span>
            </a>
          }
        </div>
      </article>
    </section>
  `,
  styles: `
    .hero {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
      align-items: stretch;
    }
    .eyebrow {
      margin: 0 0 0.5rem;
      color: var(--dl-accent);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.75rem;
      font-weight: 600;
    }
    h1 {
      margin: 0 0 0.75rem;
      font-size: clamp(1.8rem, 3vw, 2.6rem);
      letter-spacing: -0.03em;
      line-height: 1.1;
      max-width: 14ch;
    }
    .lede {
      color: var(--dl-text-secondary);
      max-width: 46ch;
      line-height: 1.5;
    }
    .cta {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.25rem;
      flex-wrap: wrap;
    }
    .btn {
      padding: 0.7rem 1rem;
      border-radius: var(--dl-radius-sm);
      border: 1px solid var(--dl-border-strong);
      font-weight: 600;
      transition:
        transform 0.15s ease,
        background 0.15s ease;
    }
    .btn:hover {
      transform: translateY(-1px);
    }
    .btn.primary {
      background: var(--dl-accent);
      color: var(--dl-text-inverse);
      border-color: var(--dl-accent);
    }
    .btn.ghost {
      background: transparent;
      color: var(--dl-text-primary);
    }
    .hero-panel {
      padding: 1.25rem;
      display: grid;
      gap: 1rem;
    }
    .stat .label {
      display: block;
      color: var(--dl-text-tertiary);
      font-size: 0.75rem;
      margin-bottom: 0.25rem;
    }
    .stat .value {
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .card {
      padding: 1rem 1.1rem;
    }
    h2 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
    }
    .empty {
      margin: 0;
      line-height: 1.5;
    }
    .empty a {
      color: var(--dl-accent);
      font-weight: 600;
    }
    .league,
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 0;
      border-top: 1px solid var(--dl-border-subtle);
    }
    .league:first-of-type,
    .row:first-child {
      border-top: 0;
    }
    .rows {
      display: flex;
      flex-direction: column;
    }
    .row .name {
      flex: 1;
    }
    .row .score {
      color: var(--dl-accent);
      font-weight: 600;
    }
    .chev {
      color: var(--dl-text-tertiary);
    }
    @media (max-width: 900px) {
      .hero,
      .grid {
        grid-template-columns: 1fr;
      }
      h1 {
        max-width: none;
      }
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly active = inject(ActiveLeagueService);
  readonly leagues = signal<League[]>([]);
  readonly top = signal<BoardPlayer[]>([]);

  ngOnInit() {
    this.api.leagues().subscribe((l) => {
      this.leagues.set(l);
      this.active.setLeagues(l);
      const id = this.active.selectedId();
      if (id) {
        this.api.board(id).subscribe((b) => this.top.set(b.filter((x) => !x.drafted).slice(0, 6)));
      }
    });
  }
}

import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ActiveLeagueService } from '../core/active-league.service';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell dl-dark">
      <aside class="sidebar">
        <div class="brand">
          <span class="mark"></span>
          <div>
            <div class="name">DraftLab</div>
            <div class="tag">Draft Optimizer</div>
          </div>
        </div>

        @if (active.leagues().length) {
          <label class="switcher">
            <span>ACTIVE LEAGUE</span>
            <select
              [value]="active.selectedId() ?? ''"
              (change)="onSelectLeague($event)"
            >
              @for (league of active.leagues(); track league.id) {
                <option [value]="league.id">{{ league.name }}</option>
              }
            </select>
          </label>
        }

        <nav>
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"
            >Dashboard</a
          >
          <a routerLink="/leagues/connect" routerLinkActive="active">Connect</a>
          <a routerLink="/leagues/manual-setup" routerLinkActive="active">Manual Setup</a>
          @if (active.selectedId(); as id) {
            <a [routerLink]="['/leagues', id, 'board']" routerLinkActive="active">Player Board</a>
            <a [routerLink]="['/leagues', id, 'cheat-sheet']" routerLinkActive="active">Cheat Sheet</a>
            <a [routerLink]="['/leagues', id, 'strategy']" routerLinkActive="active">Strategy</a>
            <a [routerLink]="['/leagues', id, 'draft']" routerLinkActive="active">Live Draft</a>
            <a [routerLink]="['/leagues', id, 'roster']" routerLinkActive="active">Dynasty</a>
            <a [routerLink]="['/leagues', id, 'auction']" routerLinkActive="active">Auction</a>
            <a [routerLink]="['/leagues', id, 'recap']" routerLinkActive="active">Recap</a>
            <a [routerLink]="['/leagues', id, 'calibration']" routerLinkActive="active">Calibration</a>
            <a [routerLink]="['/leagues', id, 'scoring']" routerLinkActive="active">Scoring</a>
          }
        </nav>
        <div class="side-foot">
          <div class="account">{{ auth.user()?.displayName }}</div>
          <button type="button" class="logout" (click)="logout()">Log out</button>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <div class="crumb">
            {{ active.selected()?.name ?? 'No league selected' }}
          </div>
          <div class="live">
            <span class="dot"></span>
            {{ active.leagues().length ? active.leagues().length + ' leagues' : 'Connect a league' }}
          </div>
        </header>
        <main class="content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: `
    .shell {
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: 100vh;
    }
    .sidebar {
      border-right: 1px solid var(--dl-border-subtle);
      background: color-mix(in srgb, var(--dl-surface-raised) 88%, transparent);
      backdrop-filter: blur(8px);
      padding: 1.25rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .brand {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      animation: fade-up 0.5s ease both;
    }
    .mark {
      width: 2rem;
      height: 2rem;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--dl-accent), #0ea5a0);
      box-shadow: 0 0 24px color-mix(in srgb, var(--dl-accent) 35%, transparent);
    }
    .name {
      font-weight: 700;
      letter-spacing: -0.02em;
      font-size: 1.15rem;
    }
    .tag {
      font-size: 0.7rem;
      color: var(--dl-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .switcher {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: var(--dl-text-tertiary);
    }
    .switcher select {
      border: 1px solid var(--dl-border-strong);
      background: var(--dl-surface-overlay);
      color: var(--dl-text-primary);
      border-radius: var(--dl-radius-sm);
      padding: 0.55rem 0.6rem;
    }
    nav {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    nav a {
      padding: 0.65rem 0.75rem;
      border-radius: var(--dl-radius-sm);
      color: var(--dl-text-secondary);
      transition:
        background 0.15s ease,
        color 0.15s ease,
        transform 0.15s ease;
    }
    nav a:hover {
      background: var(--dl-surface-overlay);
      color: var(--dl-text-primary);
      transform: translateX(2px);
    }
    nav a.active {
      background: var(--dl-accent-dim);
      color: var(--dl-accent);
    }
    .side-foot {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .account {
      font-size: 0.85rem;
      color: var(--dl-text-secondary);
    }
    .logout {
      border: 1px solid var(--dl-border-subtle);
      background: transparent;
      color: var(--dl-text-secondary);
      border-radius: var(--dl-radius-sm);
      padding: 0.45rem 0.6rem;
      text-align: left;
      cursor: pointer;
    }
    .logout:hover {
      color: var(--dl-text-primary);
      border-color: var(--dl-border-strong);
    }
    .main {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--dl-border-subtle);
    }
    .crumb {
      font-weight: 600;
    }
    .live {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      color: var(--dl-text-secondary);
      font-size: 0.85rem;
    }
    .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 999px;
      background: var(--dl-accent);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--dl-accent) 50%, transparent);
      animation: pulse 1.8s ease infinite;
    }
    .content {
      padding: 1.25rem 1.5rem 2rem;
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    @keyframes fade-up {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes pulse {
      50% {
        box-shadow: 0 0 0 6px transparent;
      }
    }
    @media (max-width: 900px) {
      .shell {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly active = inject(ActiveLeagueService);
  private readonly api = inject(ApiService);

  ngOnInit() {
    this.api.leagues().subscribe((leagues) => this.active.setLeagues(leagues));
  }

  onSelectLeague(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value) this.active.select(value);
  }

  logout() {
    void this.auth.logout();
    this.active.clear();
  }
}

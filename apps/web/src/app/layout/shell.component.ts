import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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
        <nav>
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Dashboard</a>
          <a routerLink="/leagues/connect" routerLinkActive="active">Connect</a>
          <a routerLink="/leagues/manual-setup" routerLinkActive="active">Manual Setup</a>
          <a routerLink="/leagues/demo-league/board" routerLinkActive="active">Player Board</a>
          <a routerLink="/leagues/demo-league/cheat-sheet" routerLinkActive="active">Cheat Sheet</a>
          <a routerLink="/leagues/demo-league/strategy" routerLinkActive="active">Strategy</a>
          <a routerLink="/leagues/demo-league/draft" routerLinkActive="active">Live Draft</a>
          <a routerLink="/leagues/demo-league/recap" routerLinkActive="active">Recap</a>
          <a routerLink="/leagues/demo-league/scoring" routerLinkActive="active">Scoring</a>
        </nav>
        <div class="side-foot dl-muted">Phases 3–5 foundations</div>
      </aside>
      <div class="main">
        <header class="top">
          <div class="crumb">Fantasy Football · Redraft</div>
          <div class="live"><span class="dot"></span> Demo league ready</div>
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
      gap: 1.5rem;
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
    nav {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    nav a {
      padding: 0.65rem 0.75rem;
      border-radius: var(--dl-radius-sm);
      color: var(--dl-text-secondary);
      transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
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
      font-size: 0.75rem;
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
      padding: 0.9rem 1.5rem;
      border-bottom: 1px solid var(--dl-border-subtle);
      background: color-mix(in srgb, var(--dl-surface-base) 70%, transparent);
      backdrop-filter: blur(6px);
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .crumb {
      color: var(--dl-text-secondary);
      font-size: 0.85rem;
    }
    .live {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.8rem;
      color: var(--dl-text-secondary);
    }
    .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--dl-live);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--dl-live) 60%, transparent);
      animation: pulse 2s infinite;
    }
    .content {
      padding: 1.5rem;
      animation: fade-up 0.45s ease both;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dl-live) 55%, transparent); }
      70% { box-shadow: 0 0 0 8px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }
    @keyframes fade-up {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 900px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { border-right: 0; border-bottom: 1px solid var(--dl-border-subtle); }
      nav { flex-direction: row; flex-wrap: wrap; }
    }
  `,
})
export class ShellComponent {}

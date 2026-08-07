import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { ApiService } from '../../core/api.service';
import type { League, ScoringSummary } from '../../core/api.types';

@Component({
  selector: 'app-connect',
  imports: [FormsModule, RouterLink, Button, InputText],
  template: `
    <h1>Connect leagues</h1>
    <p class="lede dl-muted">Sleeper sync for live drafts. Manual setup for everyone else.</p>

    <div class="grid">
      <article class="dl-panel card">
        <h2>Sleeper</h2>
        <p class="dl-muted">Import all leagues for a username. Polling stays on the server under a shared rate budget.</p>
        <div class="row">
          <input pInputText [(ngModel)]="username" placeholder="Sleeper username" />
          <input pInputText type="number" [(ngModel)]="season" placeholder="Season" style="width:6rem" />
          <p-button label="Connect" (onClick)="connectSleeper()" [loading]="loading()" />
        </div>
        @if (error()) {
          <p class="err">{{ error() }}</p>
        }
        @if (imported().length) {
          <div class="imports">
            @for (l of imported(); track l.id) {
              <div class="import">
                <div>
                  <strong>{{ l.name }}</strong>
                  <div class="dl-muted">
                    {{ l.teamCount }}-team · {{ l.draftType }} · slot {{ l.draftSlot ?? '—' }}
                    @if (l.scoringSummary; as s) {
                      · {{ s.plainLanguage.join(', ') }}
                    }
                  </div>
                  @for (w of l.scoringSummary?.warnings ?? []; track w) {
                    <div class="warn">{{ w }}</div>
                  }
                </div>
                <a [routerLink]="['/leagues', l.id, 'board']">Open →</a>
              </div>
            }
          </div>
        }
      </article>

      <article class="dl-panel card">
        <h2>Manual setup</h2>
        <p class="dl-muted">Configure league shape, scoring presets (incl. TE premium / superflex), and draft slot.</p>
        <a class="btn" routerLink="/leagues/manual-setup">Open setup wizard →</a>
      </article>

      <article class="dl-panel card note">
        <h2>Why ESPN isn’t listed</h2>
        <p class="dl-muted">
          ESPN fantasy ToS blocks third-party draft tooling. Use manual setup — same board, same live room, picks entered by hand.
        </p>
      </article>
    </div>
  `,
  styles: `
    h1 { margin: 0 0 0.35rem; letter-spacing: -0.02em; }
    .lede { margin: 0 0 1.25rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .card { padding: 1.1rem; display: grid; gap: 0.75rem; }
    .note { grid-column: 1 / -1; }
    h2 { margin: 0; font-size: 1.05rem; }
    .row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
    .err { color: var(--dl-danger); margin: 0; }
    .warn { color: var(--dl-warning); font-size: 0.8rem; margin-top: 0.25rem; }
    .imports { display: grid; gap: 0.55rem; }
    .import {
      display: flex; justify-content: space-between; gap: 0.75rem; align-items: start;
      padding: 0.55rem 0; border-top: 1px solid var(--dl-border-subtle);
    }
    .import:first-child { border-top: 0; }
    a { color: var(--dl-accent); font-weight: 600; }
    .btn {
      display: inline-flex; width: fit-content; padding: 0.65rem 0.9rem; border-radius: 6px;
      background: var(--dl-accent); color: var(--dl-text-inverse); font-weight: 600;
    }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } .note { grid-column: auto; } }
  `,
})
export class ConnectComponent {
  private readonly api = inject(ApiService);
  username = '';
  season = new Date().getFullYear();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly imported = signal<Array<League & { scoringSummary?: ScoringSummary }>>([]);

  connectSleeper() {
    this.loading.set(true);
    this.error.set(null);
    this.api.connectSleeper(this.username.trim(), Number(this.season) || undefined).subscribe({
      next: (res) => {
        this.imported.set(res.leagues);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Could not connect to Sleeper');
        this.loading.set(false);
      },
    });
  }
}

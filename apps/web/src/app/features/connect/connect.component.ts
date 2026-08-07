import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { ApiService } from '../../core/api.service';
import type { League } from '../../core/api.types';

@Component({
  selector: 'app-connect',
  imports: [FormsModule, RouterLink, Button, InputText],
  template: `
    <h1>Connect leagues</h1>
    <p class="lede dl-muted">Sleeper sync for live drafts. Manual setup for everyone else.</p>

    <div class="grid">
      <article class="dl-panel card">
        <h2>Sleeper</h2>
        <p class="dl-muted">Import leagues by username. Draft polling stays on the server.</p>
        <div class="row">
          <input pInputText [(ngModel)]="username" placeholder="Sleeper username" />
          <p-button label="Connect" (onClick)="connectSleeper()" [loading]="loading()" />
        </div>
        @if (error()) {
          <p class="err">{{ error() }}</p>
        }
        @if (imported().length) {
          <ul>
            @for (l of imported(); track l.id) {
              <li><a [routerLink]="['/leagues', l.id, 'board']">{{ l.name }}</a></li>
            }
          </ul>
        }
      </article>

      <article class="dl-panel card">
        <h2>Manual setup</h2>
        <p class="dl-muted">First-class path for leagues on platforms we do not integrate with.</p>
        <div class="row">
          <input pInputText [(ngModel)]="manualName" placeholder="League name" />
          <input pInputText type="number" [(ngModel)]="teamCount" placeholder="Teams" style="width:6rem" />
        </div>
        <p-button label="Create league" (onClick)="createManual()" />
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
    ul { margin: 0; padding-left: 1.1rem; }
    a { color: var(--dl-accent); }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } .note { grid-column: auto; } }
  `,
})
export class ConnectComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  username = '';
  manualName = 'My League';
  teamCount = 12;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly imported = signal<League[]>([]);

  connectSleeper() {
    this.loading.set(true);
    this.error.set(null);
    this.api.connectSleeper(this.username.trim()).subscribe({
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

  createManual() {
    this.api
      .createManualLeague({
        name: this.manualName,
        teamCount: Number(this.teamCount) || 12,
        draftSlot: 1,
        strategyId: 'balanced',
        scoringPresetId: 'preset-ppr',
      })
      .subscribe((league) => this.router.navigate(['/leagues', league.id, 'board']));
  }
}

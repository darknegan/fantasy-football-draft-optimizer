import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import type { ScoringSummary } from '../../core/api.types';

@Component({
  selector: 'app-manual-setup',
  imports: [FormsModule, Button, InputText, Select],
  template: `
    <h1>Manual league setup</h1>
    <p class="lede dl-muted">First-class path for ESPN and any platform without an API. Confirm scoring in plain language before you draft.</p>

    <div class="dl-panel form">
      <label>League name <input pInputText [(ngModel)]="name" /></label>
      <div class="row">
        <label>Teams
          <input pInputText type="number" [(ngModel)]="teamCount" />
        </label>
        <label>Draft slot
          <input pInputText type="number" [(ngModel)]="draftSlot" />
        </label>
        <label>Season
          <input pInputText type="number" [(ngModel)]="season" />
        </label>
      </div>
      <div class="row">
        <label>Format
          <p-select [options]="typeOptions" [(ngModel)]="type" optionLabel="label" optionValue="value" />
        </label>
        <label>Draft type
          <p-select [options]="draftOptions" [(ngModel)]="draftType" optionLabel="label" optionValue="value" />
        </label>
        <label>Scoring preset
          <p-select [options]="presets()" [(ngModel)]="scoringPresetId" optionLabel="name" optionValue="id" />
        </label>
      </div>
      <div class="row">
        <label>QB <input pInputText type="number" [(ngModel)]="roster.qb" /></label>
        <label>RB <input pInputText type="number" [(ngModel)]="roster.rb" /></label>
        <label>WR <input pInputText type="number" [(ngModel)]="roster.wr" /></label>
        <label>TE <input pInputText type="number" [(ngModel)]="roster.te" /></label>
        <label>Flex <input pInputText type="number" [(ngModel)]="roster.flex" /></label>
        <label>Superflex <input pInputText type="number" [(ngModel)]="roster.superflex" /></label>
        <label>Bench <input pInputText type="number" [(ngModel)]="roster.bench" /></label>
      </div>

      @if (summary(); as s) {
        <div class="summary">
          <h2>Confirm scoring</h2>
          <ul>
            @for (line of s.plainLanguage; track line) {
              <li>{{ line }}</li>
            }
          </ul>
          @for (w of s.warnings; track w) {
            <p class="warn">{{ w }}</p>
          }
          <p-button label="Confirm & create league" (onClick)="create(true)" [loading]="loading()" />
        </div>
      } @else {
        <p-button label="Review scoring summary" (onClick)="create(false)" [loading]="loading()" />
      }
      @if (error()) {
        <p class="err">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    h1 { margin: 0 0 0.25rem; }
    .lede { margin: 0 0 1.25rem; max-width: 60ch; }
    .form { padding: 1.1rem; display: grid; gap: 0.9rem; max-width: 820px; }
    label { display: grid; gap: 0.3rem; font-size: 0.8rem; color: var(--dl-text-secondary); }
    .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: 0.6rem; }
    .summary {
      border-top: 1px solid var(--dl-border-subtle); padding-top: 0.9rem; display: grid; gap: 0.5rem;
    }
    h2 { margin: 0; font-size: 1rem; }
    ul { margin: 0; padding-left: 1.1rem; color: var(--dl-text-primary); }
    .warn { color: var(--dl-warning); margin: 0; font-size: 0.85rem; }
    .err { color: var(--dl-danger); margin: 0; }
  `,
})
export class ManualSetupComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  name = 'My League';
  teamCount = 12;
  draftSlot = 1;
  season = 2025;
  type = 'redraft';
  draftType = 'snake';
  scoringPresetId = 'preset-ppr';
  roster = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0, bench: 6 };
  readonly presets = signal<Array<{ id: string; name: string }>>([]);
  readonly summary = signal<ScoringSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private pendingLeagueId: string | null = null;

  readonly typeOptions = [
    { label: 'Redraft', value: 'redraft' },
    { label: 'Dynasty', value: 'dynasty' },
    { label: 'Auction', value: 'auction' },
  ];
  readonly draftOptions = [
    { label: 'Snake', value: 'snake' },
    { label: 'Linear', value: 'linear' },
    { label: 'Auction', value: 'auction' },
  ];

  ngOnInit() {
    this.api.scoringPresets().subscribe((p) => this.presets.set(p));
  }

  create(confirm: boolean) {
    if (confirm && this.pendingLeagueId) {
      this.router.navigate(['/leagues', this.pendingLeagueId, 'board']);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api
      .createManualLeague({
        name: this.name,
        teamCount: Number(this.teamCount) || 12,
        draftSlot: Number(this.draftSlot) || 1,
        season: Number(this.season) || 2025,
        strategyId: 'balanced',
        scoringPresetId: this.scoringPresetId,
        draftType: this.draftType,
        type: this.type,
        roster: this.roster,
        confirmSummary: false,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.summary.set(res.scoringSummary);
          this.pendingLeagueId = res.league.id;
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.error ?? 'Could not create league');
        },
      });
  }
}

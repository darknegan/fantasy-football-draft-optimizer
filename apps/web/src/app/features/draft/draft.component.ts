import { Component, computed, inject, OnDestroy, OnInit, Pipe, PipeTransform, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Button } from 'primeng/button';
import { ApiService } from '../../core/api.service';
import type { BoardPlayer, DraftState, League } from '../../core/api.types';

@Pipe({ name: 'dateAgo' })
export class DateAgoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return 'never';
    const ms = Date.now() - new Date(value).getTime();
    if (ms < 5000) return 'just now';
    if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
    return `${Math.round(ms / 60000)}m ago`;
  }
}

@Component({
  selector: 'app-draft',
  imports: [Button, DateAgoPipe],
  template: `
    <div class="head">
      <div>
        <h1>Live draft room</h1>
        <p class="dl-muted">
          Pick {{ draft()?.currentPick ?? 1 }} · Round {{ round() }} ·
          @if (draft()?.lastSyncedAt) {
            synced {{ draft()!.lastSyncedAt | dateAgo }}
          } @else {
            manual mode
          }
        </p>
      </div>
      <div class="sync">
        <span class="dot"></span>
        {{ draft()?.syncMode === 'polling' ? 'Polling Sleeper' : 'Manual entry' }}
      </div>
    </div>

    <div class="layout">
      <section class="dl-panel queue">
        <h2>Recommended now</h2>
        <div class="recs">
          @for (row of available().slice(0, 8); track row.player.id) {
            <button type="button" class="rec" [class.target]="row.target" [class.avoid]="row.avoid" (click)="pick(row)" [disabled]="picking()">
              <div class="left">
                <span class="pos" [class]="row.player.position">{{ row.player.position }}</span>
                <div>
                  <strong>{{ row.player.name }}</strong>
                  <div class="reason dl-muted">
                    {{ row.recommendation?.reasons?.[0]?.message ?? 'Best available fit' }}
                  </div>
                </div>
              </div>
              <span class="score dl-mono">{{ row.recommendation?.contextualScore }}</span>
            </button>
          }
        </div>
      </section>

      <section class="dl-panel roster">
        <h2>Your roster</h2>
        @if (!roster().length) {
          <p class="dl-muted">No picks yet. Recommendations follow {{ league()?.strategyId ?? 'balanced' }}.</p>
        }
        @for (p of roster(); track p.pickNumber) {
          <div class="pick">
            <span class="dl-mono">{{ p.pickNumber }}</span>
            <span>{{ playerName(p.playerId) }}</span>
          </div>
        }
        <p-button
          class="refresh"
          label="Refresh board"
          severity="secondary"
          [outlined]="true"
          (onClick)="reload()"
        />
      </section>
    </div>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; align-items: end; }
    h1 { margin: 0 0 0.25rem; }
    .sync { display: flex; align-items: center; gap: 0.45rem; color: var(--dl-text-secondary); font-size: 0.85rem; }
    .dot {
      width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--dl-live);
      animation: pulse 2s infinite;
    }
    .layout { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem; }
    .dl-panel { padding: 1rem; }
    h2 { margin: 0 0 0.75rem; font-size: 1rem; }
    .recs { display: grid; gap: 0.5rem; }
    .rec {
      display: flex; justify-content: space-between; gap: 0.75rem; align-items: center;
      text-align: left; padding: 0.75rem; border-radius: var(--dl-radius-sm);
      border: 1px solid var(--dl-border-subtle); background: var(--dl-surface-overlay);
      color: inherit; cursor: pointer; transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .rec:hover:not(:disabled) { border-color: var(--dl-accent); transform: translateX(2px); }
    .rec:disabled { opacity: 0.5; cursor: wait; }
    .rec.target { border-color: color-mix(in srgb, var(--dl-accent) 50%, transparent); }
    .rec.avoid { border-color: color-mix(in srgb, var(--dl-grade-red) 50%, transparent); }
    .left { display: flex; gap: 0.65rem; align-items: start; }
    .reason { font-size: 0.75rem; margin-top: 0.15rem; max-width: 36ch; }
    .score { color: var(--dl-accent); font-weight: 700; font-size: 1.1rem; }
    .pick {
      display: flex; gap: 0.75rem; padding: 0.5rem 0;
      border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.9rem;
    }
    .refresh { margin-top: 1rem; display: inline-block; }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dl-live) 55%, transparent); }
      70% { box-shadow: 0 0 0 8px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
  `,
})
export class DraftComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private timer?: ReturnType<typeof setInterval>;

  leagueId = 'demo-league';
  readonly league = signal<League | null>(null);
  readonly draft = signal<DraftState | null>(null);
  readonly board = signal<BoardPlayer[]>([]);
  readonly picking = signal(false);

  readonly available = computed(() => this.board().filter((b) => !b.drafted));
  readonly round = computed(() => {
    const d = this.draft();
    const l = this.league();
    if (!d || !l) return 1;
    return Math.floor((d.currentPick - 1) / l.teamCount) + 1;
  });
  readonly roster = computed(() => {
    const d = this.draft();
    if (!d) return [];
    return d.picks.filter((p) => p.rosterId === d.userRosterId);
  });

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? 'demo-league';
    this.reload();
    this.timer = setInterval(() => this.reload(), 5000);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  reload() {
    this.api.league(this.leagueId).subscribe((l) => this.league.set(l));
    this.api.draft(this.leagueId).subscribe((d) => this.draft.set(d));
    this.api.board(this.leagueId).subscribe((b) => this.board.set(b));
  }

  playerName(id: string | null) {
    if (!id) return '—';
    return this.board().find((b) => b.player.id === id)?.player.name ?? id;
  }

  pick(row: BoardPlayer) {
    const d = this.draft();
    const l = this.league();
    if (!d || !l) return;
    this.picking.set(true);
    const pickNumber = d.currentPick;
    const round = Math.floor((pickNumber - 1) / l.teamCount) + 1;
    const slot = l.draftSlot ?? 1;
    this.api.applyPick(this.leagueId, { pickNumber, round, slot, playerId: row.player.id }).subscribe({
      next: (res) => {
        this.draft.set(res.draft);
        this.board.set(res.board);
        this.picking.set(false);
      },
      error: () => this.picking.set(false),
    });
  }
}

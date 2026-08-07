import { Component, computed, inject, OnDestroy, OnInit, Pipe, PipeTransform, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { ApiService } from '../../core/api.service';
import { clearQueuedPick, listQueuedPicks, queuePick } from '../../core/offline-draft.store';
import type { AdherenceResult, BoardPlayer, DraftState, League } from '../../core/api.types';

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
  imports: [Button, DateAgoPipe, RouterLink, FormsModule, InputText],
  template: `
    @if (draft()?.syncBanner; as banner) {
      <div class="banner">{{ banner }}</div>
    }

    <div class="head">
      <div>
        <h1>Live draft room</h1>
        <p class="dl-muted">
          Pick {{ draft()?.currentPick ?? 1 }} · Round {{ round() }} ·
          @if (draft()?.picksUntilUser != null) {
            <strong class="until">{{ draft()!.picksUntilUser === 0 ? 'Your pick' : draft()!.picksUntilUser + ' until you' }}</strong>
            ·
          }
          synced {{ draft()?.lastSyncedAt | dateAgo }}
        </p>
      </div>
      <div class="actions">
        <div class="sync">
          <span class="dot" [class.degraded]="draft()?.syncMode === 'degraded' || draft()?.syncMode === 'manual'"></span>
          {{ syncLabel() }}
        </div>
        <p-button label="Manual mode" severity="secondary" [outlined]="true" size="small" (onClick)="manualMode()" />
        <a class="link" [routerLink]="['/leagues', leagueId, 'recap']">Recap →</a>
      </div>
    </div>

    <div class="meter dl-panel">
      <div class="meter-top">
        <span>Strategy adherence</span>
        <strong>{{ adherence()?.score ?? '—' }}% · {{ (adherence()?.state ?? 'on_plan').replaceAll('_', ' ') }}</strong>
      </div>
      <div class="bar"><span [style.width.%]="adherence()?.score ?? 0"></span></div>
    </div>

    <div class="layout">
      <section class="dl-panel queue">
        <div class="queue-head">
          <h2>Recommended now</h2>
          <input pInputText [(ngModel)]="filter" placeholder="Search available…" class="search" />
        </div>
        <div class="recs">
          @for (row of filteredAvailable().slice(0, 10); track row.player.id) {
            <button
              type="button"
              class="rec"
              [class.target]="row.target"
              [class.avoid]="row.avoid"
              (click)="pick(row)"
              [disabled]="picking()"
            >
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
        <p-button class="refresh" label="Refresh board" severity="secondary" [outlined]="true" (onClick)="reload()" />
      </section>
    </div>
  `,
  styles: `
    .banner {
      margin-bottom: 0.75rem; padding: 0.65rem 0.85rem; border-radius: 6px;
      background: color-mix(in srgb, var(--dl-warning) 15%, transparent);
      border: 1px solid color-mix(in srgb, var(--dl-warning) 40%, transparent);
      color: var(--dl-warning); font-size: 0.85rem;
    }
    .head { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; align-items: end; flex-wrap: wrap; }
    h1 { margin: 0 0 0.25rem; }
    .until { color: var(--dl-accent); }
    .actions { display: flex; gap: 0.65rem; align-items: center; flex-wrap: wrap; }
    .sync { display: flex; align-items: center; gap: 0.45rem; color: var(--dl-text-secondary); font-size: 0.85rem; }
    .dot {
      width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--dl-live);
      animation: pulse 2s infinite;
    }
    .dot.degraded { background: var(--dl-warning); animation: none; }
    .link { color: var(--dl-accent); font-weight: 600; font-size: 0.85rem; }
    .meter { padding: 0.75rem 1rem; margin-bottom: 1rem; }
    .meter-top { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.4rem; }
    .bar { height: 0.4rem; background: var(--dl-surface-sunken); border-radius: 99px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--dl-accent); }
    .layout { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem; }
    .dl-panel { padding: 1rem; }
    h2 { margin: 0; font-size: 1rem; }
    .queue-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; }
    .search { max-width: 14rem; }
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
  private onlineHandler?: () => void;

  leagueId = 'demo-league';
  filter = '';
  readonly league = signal<League | null>(null);
  readonly draft = signal<DraftState | null>(null);
  readonly board = signal<BoardPlayer[]>([]);
  readonly adherence = signal<AdherenceResult | null>(null);
  readonly picking = signal(false);

  readonly available = computed(() => this.board().filter((b) => !b.drafted));
  readonly filteredAvailable = computed(() => {
    const q = this.filter.trim().toLowerCase();
    const rows = this.available();
    if (!q) return rows;
    return rows.filter((r) => r.player.name.toLowerCase().includes(q) || r.player.team.toLowerCase().includes(q));
  });
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
    this.flushQueue();
    this.timer = setInterval(() => this.reload(), 5000);
    this.onlineHandler = () => this.flushQueue();
    window.addEventListener('online', this.onlineHandler);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
  }

  syncLabel() {
    const mode = this.draft()?.syncMode;
    if (mode === 'polling') return 'Polling Sleeper';
    if (mode === 'degraded') return 'Degraded — manual OK';
    if (mode === 'hybrid') return 'Hybrid sync';
    return 'Manual entry';
  }

  reload() {
    this.api.league(this.leagueId).subscribe((l) => this.league.set(l));
    this.api.draft(this.leagueId).subscribe((d) => this.draft.set(d));
    this.api.board(this.leagueId).subscribe((b) => this.board.set(b));
    this.api.adherence(this.leagueId).subscribe((a) => this.adherence.set(a));
  }

  manualMode() {
    this.api.setManualMode(this.leagueId).subscribe((d) => this.draft.set(d));
  }

  playerName(id: string | null) {
    if (!id) return '—';
    return this.board().find((b) => b.player.id === id)?.player.name ?? id;
  }

  async pick(row: BoardPlayer) {
    const d = this.draft();
    const l = this.league();
    if (!d || !l) return;
    const pickNumber = d.currentPick;
    const round = Math.floor((pickNumber - 1) / l.teamCount) + 1;
    const slot = l.draftSlot ?? 1;
    const body = { pickNumber, round, slot, playerId: row.player.id };

    if (!navigator.onLine) {
      await queuePick({ leagueId: this.leagueId, ...body, queuedAt: new Date().toISOString() });
      this.draft.set({
        ...d,
        syncBanner: 'Offline — pick queued locally and will sync on reconnect.',
        syncMode: 'manual',
      });
      return;
    }

    this.picking.set(true);
    this.api.applyPick(this.leagueId, body).subscribe({
      next: (res) => {
        this.draft.set(res.draft);
        this.board.set(res.board);
        this.adherence.set(res.adherence);
        this.picking.set(false);
      },
      error: async () => {
        await queuePick({ leagueId: this.leagueId, ...body, queuedAt: new Date().toISOString() });
        this.picking.set(false);
        this.draft.set({
          ...d,
          syncBanner: 'Pick failed to reach server — queued locally.',
          syncMode: 'manual',
        });
      },
    });
  }

  private async flushQueue() {
    if (!navigator.onLine) return;
    const queued = await listQueuedPicks(this.leagueId);
    for (const q of queued) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.api.applyPick(this.leagueId, q).subscribe({
            next: (res) => {
              this.draft.set(res.draft);
              this.board.set(res.board);
              this.adherence.set(res.adherence);
              resolve();
            },
            error: reject,
          });
        });
        await clearQueuedPick(q.queuedAt);
      } catch {
        break;
      }
    }
  }
}

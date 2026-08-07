import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Select } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import type { DraftSlotInfo, League, StrategyDefinition } from '../../core/api.types';

@Component({
  selector: 'app-strategy',
  imports: [FormsModule, Button, Select],
  template: `
    <h1>Strategy planner</h1>
    <p class="lede dl-muted">Balanced is S-tier and the default. Sharper strategies require an explicit opt-in.</p>

    <div class="grid">
      <div class="list">
        @for (s of strategies(); track s.id) {
          <button
            type="button"
            class="dl-panel strat"
            [class.active]="s.id === selectedId()"
            (click)="select(s.id)"
          >
            <div class="top">
              <strong>{{ s.name }}</strong>
              <span class="tier" [class]="s.tier">{{ s.tier === 'unrated' ? '?' : s.tier }}</span>
            </div>
            <p>{{ s.definition }}</p>
          </button>
        }
      </div>

      <aside class="dl-panel detail">
        @if (selected(); as s) {
          <h2>{{ s.name }} plan</h2>
          <div class="controls">
            <label>
              Draft slot
              <p-select
                [options]="slots()"
                [(ngModel)]="slot"
                optionLabel="label"
                optionValue="value"
                (ngModelChange)="onSlot()"
              />
            </label>
            <p-button label="Set as league strategy" (onClick)="save()" />
          </div>
          @if (slotInfo(); as info) {
            <p class="dl-muted">
              Slot {{ info.slot }} · tier <span class="tier" [class]="info.tier">{{ info.tier }}</span>
              · picks {{ info.pickNumbers.slice(0, 6).join(', ') }}…
            </p>
          }
          <div class="rounds">
            @for (r of s.rounds.slice(0, 10); track r.round) {
              <div class="round">
                <div class="rn dl-mono">R{{ r.round }}</div>
                <div>
                  <div class="tags">
                    @for (p of r.primary; track p) {
                      <span class="pos" [class]="p">{{ p }}</span>
                    }
                    @for (p of r.avoid; track p) {
                      <span class="avoid">avoid {{ p }}</span>
                    }
                  </div>
                  <div class="note dl-muted">{{ r.note }}</div>
                </div>
              </div>
            }
          </div>
        }
      </aside>
    </div>
  `,
  styles: `
    h1 { margin: 0 0 0.25rem; }
    .lede { margin: 0 0 1.25rem; }
    .grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 1rem; align-items: start; }
    .list { display: grid; gap: 0.6rem; }
    .strat {
      text-align: left; padding: 0.9rem 1rem; cursor: pointer; color: inherit;
      border: 1px solid var(--dl-border-subtle); background: var(--dl-surface-raised);
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .strat:hover { transform: translateY(-1px); border-color: var(--dl-border-strong); }
    .strat.active { border-color: var(--dl-accent); box-shadow: inset 3px 0 0 var(--dl-accent); }
    .strat .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; }
    .strat p { margin: 0; color: var(--dl-text-secondary); font-size: 0.85rem; line-height: 1.4; }
    .detail { padding: 1.1rem; position: sticky; top: 4.5rem; }
    h2 { margin: 0 0 0.75rem; }
    .controls { display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap; margin-bottom: 0.75rem; }
    label { display: grid; gap: 0.35rem; font-size: 0.8rem; color: var(--dl-text-secondary); }
    .rounds { display: grid; gap: 0.65rem; margin-top: 1rem; }
    .round { display: grid; grid-template-columns: 2.5rem 1fr; gap: 0.6rem; }
    .rn { color: var(--dl-text-tertiary); font-weight: 600; padding-top: 0.15rem; }
    .tags { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.2rem; }
    .avoid {
      font-size: 0.7rem; color: var(--dl-grade-red);
      background: var(--dl-grade-red-fill); padding: 0.15rem 0.4rem; border-radius: 4px;
    }
    .note { font-size: 0.8rem; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class StrategyComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  leagueId = 'demo-league';
  readonly strategies = signal<StrategyDefinition[]>([]);
  readonly selectedId = signal('balanced');
  readonly slots = signal<Array<{ label: string; value: number }>>([]);
  readonly slotInfo = signal<DraftSlotInfo | null>(null);
  slot = 3;

  selected() {
    return this.strategies().find((s) => s.id === this.selectedId()) ?? null;
  }

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? 'demo-league';
    this.api.strategies().subscribe((s) => this.strategies.set(s));
    this.api.draftSlots().subscribe((slots) => {
      this.slots.set(slots.map((x) => ({ label: `1.${String(x.slot).padStart(2, '0')} (${x.tier})`, value: x.slot })));
      this.slotInfo.set(slots.find((x) => x.slot === this.slot) ?? null);
    });
    this.api.league(this.leagueId).subscribe((l: League) => {
      if (l.strategyId) this.selectedId.set(l.strategyId);
      if (l.draftSlot) {
        this.slot = l.draftSlot;
        this.onSlot();
      }
    });
  }

  select(id: string) {
    this.selectedId.set(id);
  }

  onSlot() {
    this.api.draftSlots().subscribe((slots) => {
      this.slotInfo.set(slots.find((x) => x.slot === this.slot) ?? null);
    });
  }

  save() {
    this.api
      .updateLeague(this.leagueId, { strategyId: this.selectedId(), draftSlot: this.slot })
      .subscribe();
  }
}

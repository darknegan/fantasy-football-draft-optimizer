import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { SelectButton } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import type { BoardPlayer, Position } from '../../core/api.types';

@Component({
  selector: 'app-board',
  imports: [TableModule, RouterLink, SelectButton, FormsModule],
  template: `
    <div class="head">
      <div>
        <h1>Player board</h1>
        <p class="dl-muted">
          Ceiling, archetype EV, value, and live contextual rank.
          <a [routerLink]="['/leagues', leagueId, 'cheat-sheet']">Tier cheat sheet →</a>
        </p>
      </div>
      <p-selectbutton
        [options]="posOptions"
        [ngModel]="posFilter()"
        optionLabel="label"
        optionValue="value"
        (ngModelChange)="posFilter.set($event)"
      />
    </div>

    <div class="dl-panel table-wrap">
      <p-table
        [value]="filtered()"
        [scrollable]="true"
        scrollHeight="flex"
        styleClass="p-datatable-sm"
        [rowHover]="true"
      >
        <ng-template #header>
          <tr>
            <th style="width:3rem">#</th>
            <th>Player</th>
            <th>Pos</th>
            <th>Ceiling</th>
            <th>Draft</th>
            <th>Context</th>
            <th>Archetype</th>
            <th>Value</th>
            <th>Risk</th>
            <th>ADP</th>
            <th style="width:7rem">Flags</th>
          </tr>
        </ng-template>
        <ng-template #body let-row let-i="rowIndex">
          <tr
            [class.drafted]="row.drafted"
            [class.dim]="row.drafted"
            [class.is-target]="row.target"
            [class.is-avoid]="row.avoid"
          >
            <td class="dl-mono">{{ row.drafted ? '—' : (row.recommendation?.rank ?? i + 1) }}</td>
            <td>
              <a [routerLink]="['/leagues', leagueId, 'board', row.player.id]">{{
                row.player.name
              }}</a>
              <div class="team dl-muted">{{ row.player.team }}</div>
            </td>
            <td>
              <span class="pos" [class]="row.player.position">{{ row.player.position }}</span>
            </td>
            <td class="dl-mono">
              @if (row.evaluation.ceiling.provisional) {
                <span class="prov" title="RB benchmarks not loaded">— · provisional</span>
              } @else {
                {{ row.evaluation.ceiling.ceilingScore ?? '—' }}
              }
            </td>
            <td class="dl-mono">{{ row.evaluation.draftScore }}</td>
            <td class="dl-mono accent">{{ row.recommendation?.contextualScore ?? '—' }}</td>
            <td class="small">{{ formatArchetype(row.evaluation.archetype.archetype) }}</td>
            <td
              class="dl-mono"
              [class.pos-val]="row.evaluation.value.valueScore > 0"
              [class.neg-val]="row.evaluation.value.valueScore < 0"
            >
              {{ row.evaluation.value.valueScore > 0 ? '+' : ''
              }}{{ row.evaluation.value.valueScore }}
            </td>
            <td class="dl-mono">{{ row.evaluation.risk.riskProfile }}</td>
            <td class="dl-mono">{{ row.evaluation.value.adpRoundPick }}</td>
            <td>
              <div class="flags">
                <button
                  type="button"
                  class="flag-btn"
                  [class.on]="row.target"
                  (click)="toggle(row, 'target')"
                  title="Target"
                >
                  T
                </button>
                <button
                  type="button"
                  class="flag-btn avoid"
                  [class.on]="row.avoid"
                  (click)="toggle(row, 'avoid')"
                  title="Avoid"
                >
                  A
                </button>
              </div>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: end;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      flex: 0 0 auto;
    }
    h1 {
      margin: 0 0 0.25rem;
    }
    .dl-muted a {
      color: var(--dl-accent);
      margin-left: 0.35rem;
    }
    .table-wrap {
      overflow: hidden;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    a {
      color: var(--dl-text-primary);
      font-weight: 600;
    }
    a:hover {
      color: var(--dl-accent);
    }
    .team {
      font-size: 0.75rem;
    }
    .accent {
      color: var(--dl-accent);
      font-weight: 600;
    }
    .prov {
      color: var(--dl-text-tertiary);
      font-size: 0.8rem;
    }
    .small {
      font-size: 0.8rem;
      color: var(--dl-text-secondary);
    }
    .pos-val {
      color: var(--dl-grade-green);
    }
    .neg-val {
      color: var(--dl-grade-red);
    }
    tr.dim {
      opacity: 0.4;
    }
    tr.is-target td:first-child {
      box-shadow: inset 3px 0 0 var(--dl-accent);
    }
    tr.is-avoid td:first-child {
      box-shadow: inset 3px 0 0 var(--dl-grade-red);
    }
    .flags {
      display: flex;
      gap: 0.3rem;
    }
    .flag-btn {
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 4px;
      border: 1px solid var(--dl-border-strong);
      background: transparent;
      color: var(--dl-text-tertiary);
      cursor: pointer;
      font-weight: 700;
      font-size: 0.7rem;
    }
    .flag-btn.on {
      background: var(--dl-accent-dim);
      color: var(--dl-accent);
      border-color: var(--dl-accent);
    }
    .flag-btn.avoid.on {
      background: var(--dl-grade-red-fill);
      color: var(--dl-grade-red);
      border-color: var(--dl-grade-red);
    }
  `,
})
export class BoardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  leagueId = 'demo-league';
  readonly rows = signal<BoardPlayer[]>([]);
  readonly posFilter = signal<Position | 'ALL'>('ALL');
  readonly posOptions = [
    { label: 'All', value: 'ALL' },
    { label: 'QB', value: 'QB' },
    { label: 'RB', value: 'RB' },
    { label: 'WR', value: 'WR' },
    { label: 'TE', value: 'TE' },
  ];

  readonly filtered = computed(() => {
    const f = this.posFilter();
    const rows = this.rows();
    return f === 'ALL' ? rows : rows.filter((r) => r.player.position === f);
  });

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? 'demo-league';
    this.reload();
  }

  reload() {
    this.api.board(this.leagueId).subscribe((b) => this.rows.set(b));
  }

  toggle(row: BoardPlayer, kind: 'target' | 'avoid') {
    const next = !row[kind];
    this.api.setFlag(this.leagueId, row.player.id, kind, next).subscribe(() => this.reload());
  }

  formatArchetype(a: string) {
    return a
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
  }
}

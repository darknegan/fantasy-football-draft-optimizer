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
        <p class="dl-muted">Ceiling, archetype EV, value, and live contextual rank.</p>
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
        scrollHeight="70vh"
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
          </tr>
        </ng-template>
        <ng-template #body let-row let-i="rowIndex">
          <tr [class.drafted]="row.drafted" [class.dim]="row.drafted">
            <td class="dl-mono">{{ row.drafted ? '—' : (row.recommendation?.rank ?? i + 1) }}</td>
            <td>
              <a [routerLink]="['/leagues', leagueId, 'board', row.player.id]">{{ row.player.name }}</a>
              <div class="team dl-muted">{{ row.player.team }}</div>
            </td>
            <td><span class="pos" [class]="row.player.position">{{ row.player.position }}</span></td>
            <td class="dl-mono">
              @if (row.evaluation.ceiling.provisional) {
                <span class="prov" title="RB benchmarks not loaded">— · provisional</span>
              } @else {
                {{ row.evaluation.ceiling.ceilingScore }}
              }
            </td>
            <td class="dl-mono">{{ row.evaluation.draftScore }}</td>
            <td class="dl-mono accent">{{ row.recommendation?.contextualScore ?? '—' }}</td>
            <td class="small">{{ formatArchetype(row.evaluation.archetype.archetype) }}</td>
            <td class="dl-mono" [class.pos-val]="row.evaluation.value.valueScore > 0" [class.neg-val]="row.evaluation.value.valueScore < 0">
              {{ row.evaluation.value.valueScore > 0 ? '+' : '' }}{{ row.evaluation.value.valueScore }}
            </td>
            <td class="dl-mono">{{ row.evaluation.risk.riskProfile }}</td>
            <td class="dl-mono">{{ row.evaluation.value.adpRoundPick }}</td>
          </tr>
        </ng-template>
      </p-table>
    </div>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; gap: 1rem; align-items: end; margin-bottom: 1rem; flex-wrap: wrap; }
    h1 { margin: 0 0 0.25rem; }
    .table-wrap { overflow: hidden; }
    a { color: var(--dl-text-primary); font-weight: 600; }
    a:hover { color: var(--dl-accent); }
    .team { font-size: 0.75rem; }
    .accent { color: var(--dl-accent); font-weight: 600; }
    .prov { color: var(--dl-text-tertiary); font-size: 0.8rem; }
    .small { font-size: 0.8rem; color: var(--dl-text-secondary); }
    .pos-val { color: var(--dl-grade-green); }
    .neg-val { color: var(--dl-grade-red); }
    tr.dim { opacity: 0.4; }
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
    this.api.board(this.leagueId).subscribe((b) => this.rows.set(b));
  }

  formatArchetype(a: string) {
    return a.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

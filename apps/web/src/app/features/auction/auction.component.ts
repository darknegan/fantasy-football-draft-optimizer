import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { AuctionState, ContractValuation, MaxBidResult } from '../../core/api.types';

@Component({
  selector: 'app-auction',
  imports: [RouterLink, FormsModule],
  template: `
    <a class="back" [routerLink]="['/']">← Dashboard</a>
    <h1>Auction room</h1>
    <p class="lede dl-muted">Dollar values from VORP, live inflation, max-bid, nominations, and multi-year contracts.</p>

    @if (state(); as s) {
      <div class="grid">
        <section class="dl-panel">
          <h2>Your budget</h2>
          <div class="big dl-mono accent">\${{ s.userBudget.remaining }}</div>
          <div class="kv"><span>Spent</span><strong class="dl-mono">\${{ s.userBudget.spent }}</strong></div>
          <div class="kv"><span>Slots filled</span><strong>{{ s.userBudget.rosterSlotsFilled }}/{{ s.userBudget.rosterSlotsTotal }}</strong></div>
          <div class="kv"><span>Inflation</span><strong class="dl-mono" [class.hot]="s.inflationRate > 0.05">{{ pct(s.inflationRate) }}</strong></div>
        </section>

        <section class="dl-panel">
          <h2>Team budgets</h2>
          <div class="list">
            @for (t of s.budgets; track t.rosterId) {
              <div class="row">
                <span>{{ t.name }}</span>
                <span class="dl-mono">\${{ t.remaining }}</span>
              </div>
            }
          </div>
        </section>

        <section class="dl-panel">
          <h2>Nominations</h2>
          @for (n of s.nominations; track n.playerId) {
            <div class="nom">
              <div>
                <strong>{{ n.name }}</strong>
                <span class="tag">{{ n.kind }}</span>
              </div>
              <p class="dl-muted">{{ n.reason }}</p>
            </div>
          }
        </section>

        <section class="dl-panel">
          <h2>Contract rules</h2>
          <label>Max length <input type="number" [(ngModel)]="rules.maxLength" min="1" max="6" /></label>
          <label>Dead cap % <input type="number" [(ngModel)]="deadCapPct" min="0" max="100" step="5" /></label>
          <label class="check"><input type="checkbox" [(ngModel)]="rules.allowExtensions" /> Allow extensions</label>
          <label class="check"><input type="checkbox" [(ngModel)]="rules.franchiseTag" /> Franchise tag</label>
          <button type="button" class="btn" (click)="saveRules()">Save rules</button>
        </section>

        <section class="dl-panel wide">
          <h2>Player values</h2>
          <div class="table">
            @for (v of s.values; track v.playerId) {
              <div class="value-row">
                <span class="pos" [class]="v.position">{{ v.position }}</span>
                <span class="name">{{ v.name }} <span class="dl-muted">{{ v.age }}y</span></span>
                <span class="dl-mono">fair \${{ v.fairValue }}</span>
                <span class="dl-mono accent">now \${{ v.inflatedValue }}</span>
                <button type="button" class="link" (click)="showMax(v.playerId)">Max</button>
                <button type="button" class="link" (click)="previewContract(v.playerId, v.inflatedValue)">Contract</button>
                <button type="button" class="btn sm" (click)="bid(v.playerId, v.inflatedValue)">Bid \${{ v.inflatedValue }}</button>
              </div>
            }
          </div>
        </section>

        @if (maxBid(); as m) {
          <section class="dl-panel">
            <h2>Max bid</h2>
            <div class="big dl-mono">\${{ m.maxBid }}</div>
            <p class="dl-muted">Reserves \${{ m.reserveForRest }} for {{ m.slotsLeft - 1 }} remaining stubs.</p>
          </section>
        }

        @if (contract(); as c) {
          <section class="dl-panel">
            <h2>Contract preview</h2>
            <p>{{ c.note }}</p>
            <div class="kv"><span>Total salary</span><strong class="dl-mono">\${{ c.totalSalary }}</strong></div>
            <div class="kv"><span>Surplus</span><strong class="dl-mono">{{ c.totalSurplus }}</strong></div>
            <div class="kv"><span>Dead cap</span><strong class="dl-mono">\${{ c.deadCapOnRelease }}</strong></div>
            <div class="years">
              @for (y of c.yearProjections; track y.yearOffset) {
                <div class="year">
                  <span>Y{{ y.yearOffset + 1 }}</span>
                  <span class="dl-mono">val {{ y.projectedValue }}</span>
                  <span class="dl-mono" [class.hot]="y.surplus < 0">{{ y.surplus > 0 ? '+' : '' }}{{ y.surplus }}</span>
                </div>
              }
            </div>
          </section>
        }
      </div>
      @if (error()) {
        <p class="err">{{ error() }}</p>
      }
    }
  `,
  styles: `
    .back { color: var(--dl-text-secondary); font-size: 0.85rem; }
    h1 { margin: 0.5rem 0 0.25rem; }
    .lede { margin: 0 0 1.25rem; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .wide { grid-column: 1 / -1; }
    .dl-panel { padding: 1rem; }
    h2 { margin: 0 0 0.75rem; font-size: 1rem; }
    .big { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; }
    .accent { color: var(--dl-accent); }
    .hot { color: #f59e0b; }
    .kv { display: flex; justify-content: space-between; padding: 0.35rem 0; border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.9rem; }
    .list .row { display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.85rem; }
    .nom { padding: 0.5rem 0; border-bottom: 1px solid var(--dl-border-subtle); }
    .nom p { margin: 0.2rem 0 0; font-size: 0.8rem; }
    .tag { margin-left: 0.5rem; font-size: 0.7rem; text-transform: uppercase; color: var(--dl-accent); letter-spacing: 0.06em; }
    label { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
    label input[type='number'] {
      width: 5rem; background: var(--dl-surface-overlay); border: 1px solid var(--dl-border-subtle);
      color: var(--dl-text-primary); border-radius: 6px; padding: 0.3rem 0.4rem;
    }
    .check { justify-content: flex-start; }
    .btn {
      margin-top: 0.5rem; background: var(--dl-accent-dim); color: var(--dl-accent);
      border: 1px solid color-mix(in srgb, var(--dl-accent) 40%, transparent);
      border-radius: var(--dl-radius-sm); padding: 0.45rem 0.75rem; cursor: pointer;
    }
    .btn.sm { margin: 0; padding: 0.25rem 0.5rem; font-size: 0.75rem; }
    .link { background: none; border: 0; color: var(--dl-text-secondary); cursor: pointer; font-size: 0.8rem; }
    .value-row {
      display: grid; grid-template-columns: auto 1.4fr repeat(2, auto) repeat(3, auto);
      gap: 0.6rem; align-items: center; padding: 0.45rem 0; border-bottom: 1px solid var(--dl-border-subtle); font-size: 0.85rem;
    }
    .years { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .year { display: grid; grid-template-columns: 2rem 1fr auto; gap: 0.5rem; font-size: 0.85rem; }
    .err { color: #f87171; margin-top: 1rem; }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      .wide { grid-column: auto; }
      .value-row { grid-template-columns: auto 1fr; }
    }
  `,
})
export class AuctionComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  leagueId = 'demo-auction';
  readonly state = signal<AuctionState | null>(null);
  readonly maxBid = signal<MaxBidResult | null>(null);
  readonly contract = signal<ContractValuation | null>(null);
  readonly error = signal<string | null>(null);
  rules = { maxLength: 4, allowExtensions: true, franchiseTag: false, deadCapPctOnRelease: 0.5, salaryCap: null as number | null, rolloverUnusedCap: false };
  deadCapPct = 50;

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? 'demo-auction';
    this.reload();
  }

  pct(n: number) {
    return `${(n * 100).toFixed(1)}%`;
  }

  reload() {
    this.api.auctionState(this.leagueId).subscribe((s) => {
      this.state.set(s);
      this.rules = { ...s.contractRules };
      this.deadCapPct = Math.round(s.contractRules.deadCapPctOnRelease * 100);
    });
  }

  bid(playerId: string, amount: number) {
    this.error.set(null);
    this.api.auctionBid(this.leagueId, { playerId, amount }).subscribe({
      next: (s) => {
        this.state.set(s);
        this.maxBid.set(null);
      },
      error: (err) => this.error.set(err?.error?.error ?? 'Bid failed'),
    });
  }

  showMax(playerId: string) {
    this.api.auctionMaxBid(this.leagueId, playerId).subscribe((m) => this.maxBid.set(m));
  }

  previewContract(playerId: string, annualSalary: number) {
    this.api
      .auctionContractPreview(this.leagueId, { playerId, annualSalary, years: this.rules.maxLength })
      .subscribe((c) => this.contract.set(c));
  }

  saveRules() {
    this.api
      .setContractRules(this.leagueId, {
        ...this.rules,
        deadCapPctOnRelease: this.deadCapPct / 100,
      })
      .subscribe(() => this.reload());
  }
}

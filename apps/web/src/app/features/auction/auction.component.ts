import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type {
  AuctionSignedPlayer,
  AuctionState,
  ContractValuation,
  League,
  MaxBidResult,
  Position,
} from '../../core/api.types';

type ValueRow = AuctionState['values'][number];

interface BudgetCard {
  rosterId: string;
  label: string;
  remaining: number;
  spotsLeft: number;
  perSlot: number;
  isYou: boolean;
}

interface SpendSegment {
  position: Position;
  pct: number;
}

@Component({
  selector: 'app-auction',
  templateUrl: './auction.component.html',
  styleUrl: './auction.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  leagueId = '';
  readonly loading = signal(true);
  readonly league = signal<League | null>(null);
  readonly state = signal<AuctionState | null>(null);
  readonly maxBid = signal<MaxBidResult | null>(null);
  readonly contract = signal<ContractValuation | null>(null);
  readonly error = signal<string | null>(null);
  readonly bidding = signal(false);
  readonly selectedId = signal<string | null>(null);
  readonly contractYears = signal(4);
  /** Local bid ladder for the active nomination (starts just under inflated value). */
  readonly ladderBid = signal(1);

  readonly onBlock = computed((): ValueRow | null => {
    const s = this.state();
    if (!s?.values.length) return null;
    const id = this.selectedId();
    return s.values.find((v) => v.playerId === id) ?? s.values[0] ?? null;
  });

  readonly spotsLeft = computed(() => {
    const u = this.state()?.userBudget;
    if (!u) return 0;
    return Math.max(0, u.rosterSlotsTotal - u.rosterSlotsFilled);
  });

  readonly maxBidAmount = computed(() => {
    const m = this.maxBid();
    if (m && m.playerId === this.onBlock()?.playerId) return m.maxBid;
    const u = this.state()?.userBudget;
    if (!u) return 1;
    const slots = Math.max(1, u.rosterSlotsTotal - u.rosterSlotsFilled);
    return Math.max(1, u.remaining - Math.max(0, slots - 1));
  });

  readonly currentBid = computed(() => {
    const player = this.onBlock();
    if (!player) return 1;
    return Math.max(1, Math.min(this.ladderBid(), this.maxBidAmount()));
  });

  readonly suggestedBid = computed(() => {
    const next = this.currentBid() + 1;
    return Math.min(this.maxBidAmount(), Math.max(next, this.currentBid()));
  });

  readonly budgetCards = computed((): BudgetCard[] => {
    const s = this.state();
    if (!s) return [];
    const you = s.userBudget.rosterId;
    return s.budgets.map((b) => {
      const spotsLeft = Math.max(0, b.rosterSlotsTotal - b.rosterSlotsFilled);
      const perSlot = spotsLeft > 0 ? Math.round(b.remaining / spotsLeft) : b.remaining;
      return {
        rosterId: b.rosterId,
        label: b.rosterId === you ? 'YOU' : b.name,
        remaining: b.remaining,
        spotsLeft,
        perSlot,
        isYou: b.rosterId === you,
      };
    });
  });

  readonly signedRoster = computed(
    (): AuctionSignedPlayer[] => this.state()?.signedRoster ?? [],
  );

  readonly remainingValues = computed(() => (this.state()?.values ?? []).slice(0, 12));

  readonly nominations = computed(() => (this.state()?.nominations ?? []).slice(0, 4));

  readonly spendSegments = computed((): SpendSegment[] => {
    const roster = this.signedRoster();
    const total = roster.reduce((n, p) => n + p.amount, 0);
    if (total <= 0) return [];
    const byPos: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of roster) byPos[p.position] += p.amount;
    return (Object.entries(byPos) as Array<[Position, number]>)
      .filter(([, amt]) => amt > 0)
      .map(([position, amt]) => ({ position, pct: Math.round((amt / total) * 100) }));
  });

  readonly yearOptions = computed(() => {
    const max = this.state()?.contractRules.maxLength ?? 4;
    return Array.from({ length: max }, (_, i) => i + 1);
  });

  ngOnInit(): void {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    this.reload();
  }

  roomMeta(): string {
    const s = this.state();
    const l = this.league();
    if (!s || !l) return '';
    const teams = l.teamCount;
    const cap = this.cap();
    const years = s.contractRules.maxLength;
    const lot = s.lotNumber ?? s.bids.length + 1;
    const total = s.lotTotal ?? teams * s.userBudget.rosterSlotsTotal;
    return `${teams} teams · $${cap} cap · contracts up to ${years} years · lot ${lot} of ${total}`;
  }

  cap(): number {
    return this.state()?.cap ?? this.state()?.userBudget.startingBudget ?? 200;
  }

  season(): number {
    return this.league()?.season ?? 2025;
  }

  inflationLabel(): string {
    const rate = this.state()?.inflationRate ?? 0;
    const pct = Math.round(rate * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
  }

  inflationNote(): string {
    const rate = this.state()?.inflationRate ?? 0;
    if (rate > 0.05) return 'room is overspending';
    if (rate < -0.02) return 'room is underpaying';
    return 'prices near fair value';
  }

  highBidderLabel(): string {
    return 'Floor bid';
  }

  playerMeta(player: ValueRow): string {
    const vorp = Math.round(player.vorpShare * 1000) / 10;
    return `Age ${player.age} · DraftScore ${Math.round(player.draftScore)} · ${vorp}% VORP share`;
  }

  ceilingCopy(): string {
    const u = this.state()?.userBudget;
    const max = this.maxBidAmount();
    const m = this.maxBid();
    if (!u) return '';
    const spots = this.spotsLeft();
    const reserve = m?.reserveForRest ?? Math.max(0, spots - 1);
    const share = u.startingBudget > 0 ? Math.round((max / u.startingBudget) * 100) : 0;
    return `You hold $${u.remaining} with ${spots} roster spots left. Reserving $${reserve} ($1 stubs for the rest of the roster) leaves $${max} as the most you can bid without stranding empty slots — about ${share}% of the starting cap on this nomination.`;
  }

  selectPlayer(playerId: string): void {
    this.selectedId.set(playerId);
    this.refreshLot(playerId);
  }

  setContractYears(years: number): void {
    this.contractYears.set(years);
    const player = this.onBlock();
    if (player) this.loadContract(player.playerId, player.inflatedValue, years);
  }

  bumpBid(delta: number): void {
    const next = Math.min(this.maxBidAmount(), this.currentBid() + delta);
    this.ladderBid.set(next);
  }

  placeBid(amount: number): void {
    const player = this.onBlock();
    if (!player || this.bidding()) return;
    const bid = Math.min(this.maxBidAmount(), Math.max(1, amount));
    this.bidding.set(true);
    this.error.set(null);
    this.api
      .auctionBid(this.leagueId, {
        playerId: player.playerId,
        amount: bid,
        contractYears: this.contractYears(),
      })
      .subscribe({
        next: (s) => {
          this.applyState(s);
          this.bidding.set(false);
        },
        error: (err: { error?: { error?: string }; message?: string }) => {
          this.bidding.set(false);
          this.error.set(err?.error?.error ?? err?.message ?? 'Bid failed');
        },
      });
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      league: this.api.league(this.leagueId),
      state: this.api.auctionState(this.leagueId),
    }).subscribe({
      next: ({ league, state }) => {
        this.league.set(league);
        this.applyState(state);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.error.set(err.message || 'Failed to load auction room.');
      },
    });
  }

  private applyState(s: AuctionState): void {
    this.state.set(s);
    const maxLen = s.contractRules.maxLength ?? 4;
    if (this.contractYears() > maxLen) this.contractYears.set(maxLen);

    const preferred =
      this.selectedId() && s.values.some((v) => v.playerId === this.selectedId())
        ? this.selectedId()!
        : (s.nominations[0]?.playerId ?? s.values[0]?.playerId ?? null);
    this.selectedId.set(preferred);
    if (preferred) this.refreshLot(preferred);
    else {
      this.maxBid.set(null);
      this.contract.set(null);
    }
  }

  private refreshLot(playerId: string): void {
    const row = this.state()?.values.find((v) => v.playerId === playerId);
    const floor = Math.max(1, (row?.inflatedValue ?? 10) - 6);
    this.ladderBid.set(floor);

    this.api.auctionMaxBid(this.leagueId, playerId).subscribe({
      next: (m) => {
        this.maxBid.set(m);
        if (this.ladderBid() > m.maxBid) this.ladderBid.set(Math.max(1, m.maxBid - 1));
      },
      error: () => this.maxBid.set(null),
    });

    if (row) this.loadContract(playerId, row.inflatedValue, this.contractYears());
  }

  private loadContract(playerId: string, annualSalary: number, years: number): void {
    this.api
      .auctionContractPreview(this.leagueId, { playerId, annualSalary, years })
      .subscribe({
        next: (c) => this.contract.set(c),
        error: () => this.contract.set(null),
      });
  }
}

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
type PosFilter = Position | 'ALL';
type MainTab = 'available' | 'room';
type NeedUrgency = 'critical' | 'high' | 'moderate' | 'low' | 'filled';

interface TeamNeedView {
  position: Position;
  filled: number;
  required: number;
  open: number;
  urgency: NeedUrgency;
  label: string;
  detail: string;
}

interface TeamTargetView {
  playerId: string;
  name: string;
  position: Position;
  inflatedValue: number;
  draftScore: number;
}

interface TeamRoomView {
  rosterId: string;
  label: string;
  remaining: number;
  spent: number;
  spotsLeft: number;
  perSlot: number;
  isYou: boolean;
  players: AuctionSignedPlayer[];
  needs: TeamNeedView[];
  needSummary: string;
  targets: TeamTargetView[];
}

const POS_TABS: PosFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const DEFAULT_ROSTER = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0, bench: 6, totalStarters: 7 };

@Component({
  selector: 'app-auction',
  templateUrl: './auction.component.html',
  styleUrl: './auction.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuctionComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly posTabs = POS_TABS;
  readonly Math = Math;

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
  readonly posFilter = signal<PosFilter>('ALL');
  readonly archetypeFilter = signal('all');
  readonly mainTab = signal<MainTab>('available');

  readonly availablePlayers = computed((): ValueRow[] => {
    let list = this.state()?.values ?? [];
    const pos = this.posFilter();
    if (pos !== 'ALL') list = list.filter((v) => v.position === pos);
    const arch = this.archetypeFilter();
    if (arch !== 'all') list = list.filter((v) => (v.archetype ?? '') === arch);
    return [...list].sort((a, b) => b.fairValue - a.fairValue || b.draftScore - a.draftScore);
  });

  readonly archetypes = computed(() => {
    const set = new Set(
      (this.state()?.values ?? [])
        .map((v) => v.archetype)
        .filter((a): a is string => Boolean(a)),
    );
    return [...set].sort();
  });

  readonly highlightedPlayerId = computed(() => {
    const list = this.availablePlayers();
    if (!list.length) return null;
    const selected = this.selectedId();
    if (selected && list.some((v) => v.playerId === selected)) return selected;
    return list[0]!.playerId;
  });

  readonly onBlock = computed((): ValueRow | null => {
    const s = this.state();
    if (!s?.values.length) return null;
    const id = this.highlightedPlayerId();
    return s.values.find((v) => v.playerId === id) ?? s.values[0] ?? null;
  });

  readonly spotsLeft = computed(() => {
    const u = this.state()?.userBudget;
    if (!u) return 0;
    return Math.max(0, u.rosterSlotsTotal - u.rosterSlotsFilled);
  });

  readonly maxBidAmount = computed(() => {
    const player = this.onBlock();
    const m = this.maxBid();
    if (m && m.playerId === player?.playerId) return m.maxBid;
    if (player?.ceilingValue != null) return player.ceilingValue;
    return player?.inflatedValue ?? player?.fairValue ?? 1;
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

  readonly signedRoster = computed(
    (): AuctionSignedPlayer[] => this.state()?.signedRoster ?? [],
  );

  /** Per-team budget, roster, needs, and suggested remaining targets. */
  readonly teamRooms = computed((): TeamRoomView[] => {
    const s = this.state();
    const league = this.league();
    if (!s) return [];
    const shape = league?.roster ?? DEFAULT_ROSTER;
    const you = s.userBudget.rosterId;
    const byTeam = new Map((s.teamRosters ?? []).map((t) => [t.rosterId, t.players] as const));
    const available = s.values;

    return s.budgets.map((b) => {
      let players = byTeam.get(b.rosterId) ?? [];
      if (!players.length && b.rosterId === you) players = s.signedRoster ?? [];

      const spotsLeft = Math.max(0, b.rosterSlotsTotal - b.rosterSlotsFilled);
      const perSlot = spotsLeft > 0 ? Math.round(b.remaining / spotsLeft) : b.remaining;
      const needs = buildTeamNeeds(players, shape);
      const openNeeds = needs.filter((n) => n.open > 0);
      const needSummary = openNeeds.length
        ? `Still need ${openNeeds.map((n) => `${n.open} ${n.position}`).join(', ')}`
        : spotsLeft > 0
          ? `${spotsLeft} flex/bench spot${spotsLeft === 1 ? '' : 's'} left`
          : 'Roster complete';

      const targets: TeamTargetView[] = [];
      const used = new Set<string>();
      for (const need of [...needs].sort((a, c) => urgencyRank(c.urgency) - urgencyRank(a.urgency))) {
        if (need.open <= 0 || targets.length >= 3) continue;
        const affordable = available
          .filter(
            (v) =>
              v.position === need.position &&
              !used.has(v.playerId) &&
              v.inflatedValue <= Math.max(1, Math.min(b.remaining, Math.max(perSlot * 2, perSlot))),
          )
          .sort((a, c) => c.draftScore - a.draftScore)[0];
        const pick =
          affordable ??
          available
            .filter((v) => v.position === need.position && !used.has(v.playerId))
            .sort((a, c) => a.inflatedValue - c.inflatedValue)[0];
        if (!pick) continue;
        used.add(pick.playerId);
        targets.push({
          playerId: pick.playerId,
          name: pick.name,
          position: pick.position,
          inflatedValue: pick.inflatedValue,
          draftScore: pick.draftScore,
        });
      }

      return {
        rosterId: b.rosterId,
        label: b.rosterId === you ? 'YOU' : b.name,
        remaining: b.remaining,
        spent: b.spent,
        spotsLeft,
        perSlot,
        isYou: b.rosterId === you,
        players: [...players].sort((a, c) => c.amount - a.amount),
        needs,
        needSummary,
        targets,
      };
    });
  });

  readonly nominations = computed(() => (this.state()?.nominations ?? []).slice(0, 4));

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
    const board = this.state()?.valueBoard?.label;
    const boardBit = board ? ` · ${board}` : '';
    return `${teams} teams · $${cap} cap · contracts up to ${years} years · lot ${lot} of ${total}${boardBit}`;
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
    const rank = player.overallRank != null ? ` · #${player.overallRank} market` : '';
    const vor = formatAuctionVor(player.vor);
    const vorBit = vor !== '—' ? ` · VOR ${vor}` : '';
    const arch = player.archetype ? ` · ${this.formatArchetype(player.archetype)}` : '';
    return `Age ${player.age}${vorBit}${arch}${rank}`;
  }

  valueSourceLabel(): string {
    return this.state()?.valueBoard?.label ?? 'Market fair';
  }

  formatVor(v: number | null | undefined): string {
    return formatAuctionVor(v);
  }

  ceilingCopy(): string {
    const player = this.onBlock();
    const max = this.maxBidAmount();
    const board = this.valueSourceLabel();
    const fair = player?.fairValue ?? max;
    const remaining = this.state()?.userBudget.remaining;
    const remainBit =
      remaining != null ? ` You still have $${remaining} left on the cap.` : '';
    return `$${max} is the published pay-up-to on the ${board} board (fair $${fair}), not leftover budget.${remainBit}`;
  }

  onArchetype(ev: Event): void {
    this.archetypeFilter.set((ev.target as HTMLSelectElement).value);
    this.ensureSelectionVisible();
  }

  setPosFilter(tab: PosFilter): void {
    this.posFilter.set(tab);
    this.ensureSelectionVisible();
  }

  formatArchetype(a: string): string {
    return a
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\bWr\b/g, 'WR')
      .replace(/\bRb\b/g, 'RB')
      .replace(/\bTe\b/g, 'TE')
      .replace(/\bQb\b/g, 'QB');
  }

  isSelected(row: ValueRow): boolean {
    return this.highlightedPlayerId() === row.playerId;
  }

  selectPlayer(playerId: string): void {
    this.selectedId.set(playerId);
    this.refreshLot(playerId);
  }

  private ensureSelectionVisible(): void {
    const list = this.availablePlayers();
    const selected = this.selectedId();
    if (selected && list.some((v) => v.playerId === selected)) return;
    const next = list[0]?.playerId ?? null;
    this.selectedId.set(next);
    if (next) this.refreshLot(next);
    else {
      this.maxBid.set(null);
      this.contract.set(null);
    }
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
    const remaining = this.state()?.userBudget.remaining ?? amount;
    const bid = Math.min(this.maxBidAmount(), remaining, Math.max(1, amount));
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

function urgencyRank(u: NeedUrgency): number {
  if (u === 'critical') return 4;
  if (u === 'high') return 3;
  if (u === 'moderate') return 2;
  if (u === 'low') return 1;
  return 0;
}

function buildTeamNeeds(
  players: AuctionSignedPlayer[],
  shape: {
    qb: number;
    rb: number;
    wr: number;
    te: number;
    flex: number;
    superflex: number;
  },
): TeamNeedView[] {
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of players) counts[p.position] += 1;

  const required: Record<Position, number> = {
    QB: shape.qb + shape.superflex,
    RB: shape.rb,
    WR: shape.wr,
    TE: shape.te,
  };

  const flexFilled = Math.max(
    0,
    counts.RB + counts.WR + counts.TE - shape.rb - shape.wr - shape.te,
  );
  const flexOpen = Math.max(0, shape.flex - flexFilled);

  return (['QB', 'RB', 'WR', 'TE'] as Position[]).map((position) => {
    const filled = counts[position];
    const req = required[position];
    const starterOpen = Math.max(0, req - filled);
    // Soft flex need once starters are filled for flex-eligible positions.
    const open =
      starterOpen > 0
        ? starterOpen
        : position !== 'QB' && flexOpen > 0
          ? Math.min(flexOpen, 1)
          : 0;
    let urgency: NeedUrgency = 'filled';
    if (starterOpen > 0) {
      const ratio = filled / Math.max(req, 1);
      urgency = ratio === 0 ? 'critical' : ratio < 0.5 ? 'high' : 'moderate';
    } else if (position !== 'QB' && flexOpen > 0) {
      urgency = 'low';
    }
    const label =
      urgency === 'critical'
        ? 'Critical'
        : urgency === 'high'
          ? 'High'
          : urgency === 'moderate'
            ? 'Moderate'
            : urgency === 'low'
              ? 'Flex'
              : 'Filled';
    const detail =
      starterOpen > 0
        ? `${starterOpen} starter${starterOpen === 1 ? '' : 's'} open`
        : position !== 'QB' && flexOpen > 0
          ? 'Can fill flex'
          : `${filled}/${req} starters`;
    return { position, filled, required: req, open, urgency, label, detail };
  });
}

function formatAuctionVor(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const rounded = v.toFixed(1);
  return v > 0 ? `+${rounded}` : rounded;
}

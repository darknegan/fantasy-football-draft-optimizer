import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  Pipe,
  PipeTransform,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { clearQueuedPick, listQueuedPicks, queuePick } from '../../core/offline-draft.store';
import type {
  AdherenceResult,
  BoardPlayer,
  DraftState,
  League,
  Position,
  RosterShape,
  StrategyDefinition,
} from '../../core/api.types';

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

interface BoardColumn {
  slot: number;
  label: string;
  isYou: boolean;
}

interface BoardCell {
  pickNumber: number;
  slot: number;
  isYouCol: boolean;
  isOnClock: boolean;
  isYourPick: boolean;
  filled: boolean;
  position?: Position;
  playerName?: string;
}

interface BoardRow {
  round: number;
  cells: BoardCell[];
}

interface RosterSlotView {
  key: string;
  position: Position;
  badge: string;
  badgePos: Position;
  playerName: string | null;
  pickNumber: number | null;
}

interface NeedView {
  position: Position;
  label: string;
  detail: string;
  tone: 'critical' | 'high' | 'moderate' | 'low';
  barPct: number;
}

interface RecentPickView {
  pickNumber: number;
  position: Position;
  playerName: string;
  teamLabel: string;
}

interface PositionRunView {
  title: string;
  body: string;
  position: Position;
}

const DEFAULT_ROSTER: RosterShape = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  bench: 6,
  totalStarters: 7,
};

const STRATEGY_NAMES: Record<string, string> = {
  balanced: 'Balanced',
  hero_rb: 'Hero RB',
  hero_wr: 'Hero WR',
  zero_rb: 'Zero RB',
  robust_rb: 'Robust RB',
  elite_te: 'Elite TE',
  elite_qb: 'Elite QB',
  double_hero_rb: 'Double Hero RB',
  double_hero_wr: 'Double Hero WR',
};

type PosFilter = Position | 'ALL';
type MainTab = 'available' | 'board';

const POS_TABS: PosFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];

@Component({
  selector: 'app-draft',
  imports: [DateAgoPipe],
  templateUrl: './draft.component.html',
  styleUrl: './draft.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private timer?: ReturnType<typeof setInterval>;
  private onlineHandler?: () => void;

  readonly totalRounds = 16;
  readonly posTabs = POS_TABS;

  leagueId = '';
  readonly league = signal<League | null>(null);
  readonly draft = signal<DraftState | null>(null);
  readonly board = signal<BoardPlayer[]>([]);
  readonly adherence = signal<AdherenceResult | null>(null);
  readonly strategies = signal<StrategyDefinition[]>([]);
  readonly picking = signal(false);
  readonly posFilter = signal<PosFilter>('ALL');
  readonly archetypeFilter = signal('all');
  readonly mainTab = signal<MainTab>('available');
  readonly brokenHeadshots = signal<ReadonlySet<string>>(new Set());

  readonly teamCount = computed(() => this.league()?.teamCount ?? 12);
  readonly userSlot = computed(() => this.league()?.draftSlot ?? 1);

  readonly round = computed(() => {
    const d = this.draft();
    const n = this.teamCount();
    if (!d) return 1;
    return Math.floor((d.currentPick - 1) / n) + 1;
  });

  readonly nextUserPickOverall = computed(() => {
    const d = this.draft();
    const slot = this.userSlot();
    const n = this.teamCount();
    if (!d) return slot;
    for (let p = d.currentPick; p <= n * this.totalRounds; p++) {
      if (slotForPick(p, n) === slot) return p;
    }
    return d.currentPick;
  });

  readonly picksUntilUser = computed(() => {
    const d = this.draft();
    if (!d) return null;
    if (d.picksUntilUser != null) return d.picksUntilUser;
    return Math.max(0, this.nextUserPickOverall() - d.currentPick);
  });

  readonly isUserTurn = computed(() => this.picksUntilUser() === 0);

  readonly archetypes = computed(() => {
    const set = new Set(
      this.board()
        .filter((b) => !b.drafted)
        .map((b) => b.evaluation.archetype.archetype),
    );
    return [...set].sort();
  });

  /** Full available board: position + archetype filters, highest draft score first. */
  readonly availablePlayers = computed(() => {
    let list = this.board().filter((b) => !b.drafted);
    const pos = this.posFilter();
    if (pos !== 'ALL') list = list.filter((b) => b.player.position === pos);
    const arch = this.archetypeFilter();
    if (arch !== 'all') {
      list = list.filter((b) => b.evaluation.archetype.archetype === arch);
    }
    return [...list].sort((a, b) => draftScoreOf(b) - draftScoreOf(a));
  });

  readonly boardColumns = computed((): BoardColumn[] => {
    const n = this.teamCount();
    const you = this.userSlot();
    return Array.from({ length: n }, (_, i) => {
      const slot = i + 1;
      return {
        slot,
        label: slot === you ? 'YOU' : `Team ${slot}`,
        isYou: slot === you,
      };
    });
  });

  readonly boardRows = computed((): BoardRow[] => {
    const d = this.draft();
    const n = this.teamCount();
    const you = this.userSlot();
    const byPick = new Map((d?.picks ?? []).map((p) => [p.pickNumber, p]));
    const current = d?.currentPick ?? 1;
    const nextYou = this.nextUserPickOverall();
    const maxRound = Math.min(
      this.totalRounds,
      Math.max(3, Math.ceil(current / n) + 1, Math.ceil((d?.picks.length ?? 0) / n) + 1),
    );

    const rows: BoardRow[] = [];
    for (let round = 1; round <= maxRound; round++) {
      const cells: BoardCell[] = [];
      for (let slot = 1; slot <= n; slot++) {
        const pickNumber = pickNumberForSlot(round, slot, n);
        const event = byPick.get(pickNumber);
        const player = event?.playerId
          ? this.board().find((b) => b.player.id === event.playerId)
          : undefined;
        cells.push({
          pickNumber,
          slot,
          isYouCol: slot === you,
          isOnClock: pickNumber === current && !event?.playerId,
          isYourPick: pickNumber === nextYou && !event?.playerId,
          filled: Boolean(event?.playerId),
          position: player?.player.position,
          playerName: player ? shortName(player.player.name) : undefined,
        });
      }
      rows.push({ round, cells });
    }
    return rows;
  });

  readonly rosterSlots = computed((): RosterSlotView[] => {
    const shape = this.league()?.roster ?? DEFAULT_ROSTER;
    const picks = (this.draft()?.picks ?? [])
      .filter((p) => p.rosterId === this.draft()?.userRosterId && p.playerId)
      .sort((a, b) => a.pickNumber - b.pickNumber);
    const used = new Set<string>();
    const slots: Array<{ key: string; position: Position }> = [];
    const push = (position: Position, count: number) => {
      for (let i = 0; i < count; i++) slots.push({ key: `${position}-${i}`, position });
    };
    push('QB', shape.qb + shape.superflex);
    push('RB', shape.rb);
    push('WR', shape.wr);
    push('TE', shape.te);
    for (let i = 0; i < shape.flex; i++) slots.push({ key: `FLEX-${i}`, position: 'WR' });

    const assigned: RosterSlotView[] = slots.map((s) => ({
      key: s.key,
      position: s.position,
      badge: s.key.startsWith('FLEX') ? 'FLEX' : s.position,
      badgePos: s.key.startsWith('FLEX') ? ('WR' as Position) : s.position,
      playerName: null,
      pickNumber: null,
    }));

    // Fill strict positions first, then flex.
    for (const pick of picks) {
      const player = this.board().find((b) => b.player.id === pick.playerId);
      if (!player || used.has(pick.playerId!)) continue;
      const pos = player.player.position;
      let idx = assigned.findIndex(
        (s) => !s.playerName && !s.key.startsWith('FLEX') && s.position === pos,
      );
      if (idx < 0 && (pos === 'RB' || pos === 'WR' || pos === 'TE')) {
        idx = assigned.findIndex((s) => !s.playerName && s.key.startsWith('FLEX'));
      }
      if (idx < 0) continue;
      used.add(pick.playerId!);
      assigned[idx] = {
        ...assigned[idx]!,
        position: pos,
        badge: pos,
        badgePos: pos,
        playerName: player.player.name,
        pickNumber: pick.pickNumber,
      };
    }

    return assigned;
  });

  readonly teamNeeds = computed((): NeedView[] => {
    const shape = this.league()?.roster ?? DEFAULT_ROSTER;
    const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const slot of this.rosterSlots()) {
      if (slot.playerName) counts[slot.position] += 1;
    }
    const required: Record<Position, number> = {
      QB: shape.qb + shape.superflex,
      RB: shape.rb,
      WR: shape.wr,
      TE: shape.te,
    };
    const order: Position[] = ['WR', 'TE', 'RB', 'QB'];
    return order.map((position) => {
      const filled = counts[position];
      const need = Math.max(0, required[position] - filled);
      const urgency =
        need > 0 ? 1 - filled / Math.max(required[position], 1) : filled === 0 ? 0.2 : 0.08;
      const tone =
        urgency >= 0.75 ? 'critical' : urgency >= 0.45 ? 'high' : urgency >= 0.2 ? 'moderate' : 'low';
      const label =
        tone === 'critical'
          ? 'Critical'
          : tone === 'high'
            ? 'High'
            : tone === 'moderate'
              ? 'Moderate'
              : 'Low';
      const detail =
        need > 0
          ? `${need} slot${need === 1 ? '' : 's'} open`
          : position === 'QB'
            ? 'wait for later rounds'
            : `${position} starters filled`;
      return {
        position,
        label,
        detail,
        tone,
        barPct: Math.round(Math.min(1, Math.max(0.12, urgency)) * 100),
      };
    });
  });

  readonly recentPicks = computed((): RecentPickView[] => {
    const d = this.draft();
    const n = this.teamCount();
    if (!d) return [];
    return [...d.picks]
      .filter((p) => p.playerId)
      .sort((a, b) => b.pickNumber - a.pickNumber)
      .slice(0, 4)
      .map((p) => {
        const player = this.board().find((b) => b.player.id === p.playerId);
        const slot = slotForPick(p.pickNumber, n);
        return {
          pickNumber: p.pickNumber,
          position: player?.player.position ?? 'WR',
          playerName: player?.player.name ?? p.playerId!,
          teamLabel: slot === this.userSlot() ? 'YOU' : `Team ${slot}`,
        };
      });
  });

  readonly positionRun = computed((): PositionRunView | null => {
    const d = this.draft();
    if (!d) return null;
    const recent = [...d.picks]
      .filter((p) => p.playerId)
      .sort((a, b) => b.pickNumber - a.pickNumber)
      .slice(0, 10);
    if (recent.length < 5) return null;
    const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of recent) {
      const pos = this.board().find((b) => b.player.id === p.playerId)?.player.position;
      if (pos) counts[pos] += 1;
    }
    const top = (Object.entries(counts) as Array<[Position, number]>).sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] / recent.length < 0.45) return null;
    const [position, count] = top;
    const label =
      position === 'RB'
        ? 'Running back'
        : position === 'WR'
          ? 'Wide receiver'
          : position === 'TE'
            ? 'Tight end'
            : 'Quarterback';
    const next = this.formatPick(this.survivalTargetPick());
    return {
      position,
      title: `${label} run in progress`,
      body: `${count} of the last ${recent.length} selections were ${label.toLowerCase()}s, so ${position} supply is draining faster than ADP predicts. Tier depth at the position may be gone before your ${next} pick — but do not let that push you onto a worse player than the best alternative on the board.`,
    };
  });

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.strategies().subscribe({
      next: (s) => this.strategies.set(s),
      error: () => undefined,
    });
    this.reload();
    void this.flushQueue();
    this.timer = setInterval(() => this.reload(), 5000);
    this.onlineHandler = () => void this.flushQueue();
    window.addEventListener('online', this.onlineHandler);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
  }

  isDegraded() {
    const mode = this.draft()?.syncMode;
    return mode === 'degraded' || mode === 'manual';
  }

  syncTitle() {
    const platform = this.league()?.platform === 'sleeper' ? 'Sleeper' : 'Manual';
    const mode = this.draft()?.syncMode;
    if (mode === 'polling') return `${platform} · polling`;
    if (mode === 'degraded') return `${platform} · degraded`;
    if (mode === 'hybrid') return `${platform} · hybrid`;
    return `${platform} · manual`;
  }

  onTheClockLabel() {
    const d = this.draft();
    const n = this.teamCount();
    if (!d) return 'Waiting for draft';
    const slot = slotForPick(d.currentPick, n);
    const team = slot === this.userSlot() ? 'You' : `Team ${slot}`;
    return `${team} · pick ${this.formatPick(d.currentPick)}`;
  }

  untilYouLabel() {
    const until = this.picksUntilUser();
    if (until == null) return '—';
    if (until === 0) return 'On the clock';
    if (until === 1) return '1 selection away';
    return `${until} selections away`;
  }

  pickClockLabel() {
    if (this.isUserTurn()) return 'NOW';
    const until = this.picksUntilUser();
    if (until == null) return '—';
    // Honest: we don't get Sleeper's pick timer — show picks remaining instead.
    return `${until}`;
  }

  strategyLabel() {
    const id = this.league()?.strategyId ?? 'balanced';
    return (
      this.strategies().find((s) => s.id === id)?.name ?? STRATEGY_NAMES[id] ?? id.replaceAll('_', ' ')
    );
  }

  canDraft() {
    const d = this.draft();
    return Boolean(d && d.status !== 'complete');
  }

  canUserDraft() {
    return this.canDraft() && this.isUserTurn();
  }

  formatPick(overall: number): string {
    const n = this.teamCount();
    const round = Math.floor((overall - 1) / n) + 1;
    const slot = ((overall - 1) % n) + 1;
    // Display snake pick as round.slot-in-round (not team slot).
    return `${round}.${String(slot).padStart(2, '0')}`;
  }

  survivalTargetPick() {
    const n = this.teamCount();
    const next = this.nextUserPickOverall();
    // "Survives to" the following user pick (turn after next), matching the mock.
    for (let p = next + 1; p <= n * this.totalRounds; p++) {
      if (slotForPick(p, n) === this.userSlot()) return p;
    }
    return next + n;
  }

  playerMeta(row: BoardPlayer): string {
    const p = row.player;
    const adp = row.evaluation.value.adpRoundPick;
    const bits = [p.team, p.age != null ? String(p.age) : null, p.seasonsInLeague != null ? `Yr ${p.seasonsInLeague}` : null, adp || null];
    return bits.filter(Boolean).join(' · ');
  }

  headshotOf(row: BoardPlayer): string | null {
    if (this.brokenHeadshots().has(row.player.id)) return null;
    return row.player.headshotThumbUrl || row.player.headshotUrl || null;
  }

  onHeadshotError(playerId: string): void {
    this.brokenHeadshots.update((prev) => {
      if (prev.has(playerId)) return prev;
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  }

  scoreLabel(row: BoardPlayer): string {
    return String(Math.round(draftScoreOf(row)));
  }

  onArchetype(ev: Event) {
    this.archetypeFilter.set((ev.target as HTMLSelectElement).value);
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

  primaryReason(row: BoardPlayer): string | null {
    const reasons = row.recommendation?.reasons ?? [];
    if (reasons[0]?.message) return reasons[0].message;
    if (row.target) return 'On your target list';
    const adp = row.evaluation.value.adpRoundPick;
    return adp ? `ADP ${adp}` : null;
  }

  survivalOf(row: BoardPlayer): number {
    return row.recommendation?.survivalProbability ?? 0.4;
  }

  survivalTone(row: BoardPlayer): string {
    const p = this.survivalOf(row);
    if (p < 0.25) return 'red';
    if (p < 0.4) return 'yellow';
    return 'green';
  }

  formatPct(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  adherenceLabel() {
    const state = this.adherence()?.state ?? 'on_plan';
    if (state === 'on_plan') return 'On plan';
    if (state === 'drifting') return 'Drifting';
    return 'Pivot';
  }

  adherenceTone() {
    const state = this.adherence()?.state ?? 'on_plan';
    if (state === 'drifting') return 'drifting';
    if (state === 'pivot_recommended') return 'pivot';
    return '';
  }

  adherenceCopy() {
    const a = this.adherence();
    const strategy = this.strategyLabel();
    const next = this.formatPick(this.nextUserPickOverall());
    if (!a) {
      return `${strategy} is active. Recommendations at ${next} follow the round plan and your open starter slots.`;
    }
    if (a.state === 'on_plan') {
      return `${strategy} is on track. At ${next}, stay with the plan unless a clear value outlier appears.`;
    }
    if (a.gapPositions.length) {
      return `${strategy} is ${a.state.replaceAll('_', ' ')}. Gaps at ${a.gapPositions.join(', ')} are pulling the roster off plan.`;
    }
    return `${strategy} adherence ${a.score}% — ${a.state.replaceAll('_', ' ')}.`;
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

  async pick(row: BoardPlayer) {
    const d = this.draft();
    const l = this.league();
    if (!d || !l || !this.canUserDraft()) return;
    const pickNumber = d.currentPick;
    const round = Math.floor((pickNumber - 1) / l.teamCount) + 1;
    const slot = this.userSlot();
    const body = {
      pickNumber,
      round,
      slot,
      playerId: row.player.id,
      rosterId: d.userRosterId,
    };

    const userId = this.auth.user()?.id;
    if (!userId) return;

    if (!navigator.onLine) {
      await queuePick({ userId, leagueId: this.leagueId, ...body, queuedAt: new Date().toISOString() });
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
        await queuePick({
          userId,
          leagueId: this.leagueId,
          ...body,
          queuedAt: new Date().toISOString(),
        });
        this.picking.set(false);
        this.draft.set({
          ...d,
          syncBanner: 'Pick failed to reach server — queued locally.',
          syncMode: 'manual',
        });
      },
    });
  }

  /** Advance opponent picks by ADP until the user's next selection (manual leagues). */
  async fillToMyPick() {
    const l = this.league();
    let d = this.draft();
    if (!l || !d || this.picking() || this.isUserTurn()) return;

    this.picking.set(true);
    try {
      let guard = 0;
      while (guard++ < l.teamCount * 2) {
        d = this.draft();
        if (!d || this.isUserTurn() || d.status === 'complete') break;
        const pickNumber = d.currentPick;
        const slot = slotForPick(pickNumber, l.teamCount);
        if (slot === this.userSlot()) break;

        const taken = new Set(d.picks.filter((p) => p.playerId).map((p) => p.playerId!));
          const teams = l.teamCount;
        const nextPlayer = [...this.board()]
          .filter((b) => !b.drafted && !taken.has(b.player.id))
          .sort((a, b) => adpRank(a, teams) - adpRank(b, teams))[0];
        if (!nextPlayer) break;

        const round = Math.floor((pickNumber - 1) / l.teamCount) + 1;
        const res = await new Promise<{
          draft: DraftState;
          board: BoardPlayer[];
          adherence: AdherenceResult;
        }>((resolve, reject) => {
          this.api
            .applyPick(this.leagueId, {
              pickNumber,
              round,
              slot,
              playerId: nextPlayer.player.id,
              rosterId: `roster-${slot}`,
            })
            .subscribe({ next: resolve, error: reject });
        });
        this.draft.set(res.draft);
        this.board.set(res.board);
        this.adherence.set(res.adherence);
      }
    } catch {
      const cur = this.draft();
      if (cur) {
        this.draft.set({
          ...cur,
          syncBanner: 'Could not simulate all the way to your pick — try again.',
        });
      }
    } finally {
      this.picking.set(false);
    }
  }

  private async flushQueue() {
    if (!navigator.onLine) return;
    const userId = this.auth.user()?.id;
    if (!userId) return;
    const queued = await listQueuedPicks(userId, this.leagueId);
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

function slotForPick(pickNumber: number, teamCount: number): number {
  const round = Math.floor((pickNumber - 1) / teamCount) + 1;
  const indexInRound = (pickNumber - 1) % teamCount;
  if (round % 2 === 1) return indexInRound + 1;
  return teamCount - indexInRound;
}

function pickNumberForSlot(round: number, slot: number, teamCount: number): number {
  if (round % 2 === 1) return (round - 1) * teamCount + slot;
  return (round - 1) * teamCount + (teamCount - slot + 1);
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return parts[parts.length - 1]!;
}

function adpRank(row: BoardPlayer, teamCount: number): number {
  const blended = row.evaluation.value.blendedRank;
  if (Number.isFinite(blended) && blended > 0) return blended;
  const label = row.evaluation.value.adpRoundPick;
  const m = /^(\d+)\.(\d+)$/.exec(label ?? '');
  if (!m) return 999;
  return (Number(m[1]) - 1) * teamCount + Number(m[2]);
}

/** Same ordering as the player board's default "Draft score" sort. */
function draftScoreOf(row: BoardPlayer): number {
  return row.recommendation?.contextualScore ?? row.evaluation.draftScore;
}

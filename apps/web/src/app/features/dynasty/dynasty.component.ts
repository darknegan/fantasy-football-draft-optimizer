import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type {
  DynastyBoardRow,
  DynastyMode,
  DynastyOverview,
  DynastyTeamRoster,
  League,
  Position,
} from '../../core/api.types';

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

interface PositionGroup {
  position: Position;
  players: DynastyBoardRow[];
}

interface TeamRosterView {
  rosterId: string;
  name: string;
  isUser: boolean;
  spent?: number;
  remaining?: number;
  groups: PositionGroup[];
  playerCount: number;
}

interface AgeBar {
  label: string;
  short: string;
  count: number;
  height: number;
  tone: 'young' | 'prime' | 'old';
}

@Component({
  selector: 'app-dynasty',
  imports: [RouterLink],
  templateUrl: './dynasty.component.html',
  styleUrl: './dynasty.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynastyComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  leagueId = '';
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly league = signal<League | null>(null);
  readonly overview = signal<DynastyOverview | null>(null);
  readonly query = signal('');

  readonly summary = computed(() => {
    const o = this.overview();
    const season = this.league()?.season ?? 2025;
    return (
      o?.summary ?? {
        rosterCount: o?.rosterBoard?.length ?? 0,
        meanAge: o?.ageCurve.meanAge ?? 0,
        agingRisk: 0,
        contendWindow: { startSeason: season, endSeason: season + 2, seasons: 3 },
        horizon: { startSeason: season + 1, endSeason: season + 4 },
        pickCount: o?.pickAssets.filter((p) => p.ownerRosterId === 'roster-user').length ?? 0,
        firsts: 0,
        seconds: 0,
      }
    );
  });

  readonly rosterRows = computed((): DynastyBoardRow[] => {
    const o = this.overview();
    if (!o) return [];
    return o.rosterBoard ?? [];
  });

  readonly isAuction = computed(() => {
    const overview = this.overview();
    if (overview?.isAuction != null) return overview.isAuction;
    const league = this.league();
    return league?.draftType === 'auction' || league?.type === 'auction';
  });

  readonly teamViews = computed((): TeamRosterView[] => {
    const overview = this.overview();
    if (!overview) return [];
    const q = this.query().trim().toLowerCase();
    const teams: DynastyTeamRoster[] = overview.teamRosters?.length
      ? overview.teamRosters
      : [
          {
            rosterId: overview.userRosterId ?? 'roster-user',
            name: 'You',
            isUser: true,
            players: this.rosterRows(),
          },
        ];

    return teams
      .map((team) => {
        const nameHit = Boolean(q) && team.name.toLowerCase().includes(q);
        const players = nameHit
          ? team.players
          : q
            ? team.players.filter(
                (row) =>
                  row.name.toLowerCase().includes(q) ||
                  row.position.toLowerCase().includes(q) ||
                  row.archetype.toLowerCase().includes(q),
              )
            : team.players;
        return {
          rosterId: team.rosterId,
          name: team.name,
          isUser: team.isUser,
          spent: team.spent,
          remaining: team.remaining,
          playerCount: players.length,
          groups: POSITIONS.map((position) => ({
            position,
            players: players.filter((row) => row.position === position),
          })),
        };
      })
      .filter((team) => !q || team.playerCount > 0 || team.name.toLowerCase().includes(q));
  });

  readonly filteredRoster = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.rosterRows();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.position.toLowerCase().includes(q) ||
        r.archetype.toLowerCase().includes(q),
    );
  });

  readonly ownedPicks = computed(() => {
    const o = this.overview();
    if (!o) return [];
    return o.pickAssets
      .filter((p) => p.ownerRosterId === 'roster-user' || p.ownerRosterId.endsWith('user'))
      .sort((a, b) => a.season - b.season || a.round - b.round);
  });

  readonly ageBars = computed((): AgeBar[] => {
    const buckets = this.overview()?.ageCurve.buckets ?? [];
    const max = Math.max(1, ...buckets.map((b) => b.count));
    return buckets.map((b) => {
      const mid = (parseInt(b.label, 10) || 25) + 1;
      const tone: AgeBar['tone'] = mid >= 30 ? 'old' : mid >= 27 ? 'prime' : 'young';
      const short = b.label.replace('–', '–').split('–')[0] ?? b.label;
      return {
        label: b.label,
        short: b.label.includes('+') ? '33+' : short,
        count: b.count,
        height: Math.max(10, Math.round((b.count / max) * 100)),
        tone,
      };
    });
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id') ?? '';
      if (!id || id === this.leagueId) return;
      this.leagueId = id;
      this.query.set('');
      this.reload();
    });
  }

  setMode(mode: DynastyMode): void {
    this.api.setDynastyMode(this.leagueId, mode).subscribe({
      next: (o) => this.overview.set(o),
      error: (err: Error) => this.error.set(err.message || 'Could not update mode'),
    });
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  headlineMeta(): string {
    const l = this.league();
    const s = this.summary();
    const name = l?.name ?? 'League';
    const teams = this.league()?.teamCount ?? this.overview()?.teamRosters?.length;
    const teamBit = teams != null ? `${teams}-team league · ` : '';
    return `${name} · ${teamBit}${s.rosterCount} rostered · average age ${s.meanAge.toFixed(1)} · valuation horizon ${s.horizon.startSeason}–${s.horizon.endSeason}`;
  }

  platformLabel(): string {
    const p = this.league()?.platform === 'sleeper' ? 'Sleeper' : 'Manual';
    return `${p} · live`;
  }

  ageNote(): string {
    const age = this.summary().meanAge;
    if (age < 25) return 'young core';
    if (age <= 28) return 'prime window';
    return 'aging core';
  }

  shortYear(season: number): string {
    return String(season).slice(-2);
  }

  formatArchetype(raw: string): string {
    switch (raw.toUpperCase()) {
      case 'ELITE':
        return 'Elite';
      case 'PROVEN_BREAKOUT_CANDIDATE':
        return 'Proven';
      case 'TRUSTY_VETERAN':
        return 'Trusty Veteran';
      case 'VETERAN':
        return 'Veteran';
      case 'IN_THEIR_PRIME':
        return 'In Their Prime';
      case 'BREAKOUT_CANDIDATE':
        return 'Breakout';
      default:
        return raw
          .replaceAll('_', ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  archTone(raw: string): string {
    switch (raw.toUpperCase()) {
      case 'ELITE':
      case 'PROVEN_BREAKOUT_CANDIDATE':
      case 'TRUSTY_VETERAN':
        return 'good';
      case 'IN_THEIR_PRIME':
        return 'mid';
      case 'BREAKOUT_CANDIDATE':
        return 'warn';
      case 'VETERAN':
        return 'bad';
      default:
        return 'mid';
    }
  }

  barWidth(value: number, curve: DynastyBoardRow['curve']): number {
    const max = Math.max(...curve.points.map((p) => p.value), 1);
    return Math.max(12, Math.round((value / max) * 100));
  }

  barTone(value: number, curve: DynastyBoardRow['curve']): string {
    const max = Math.max(...curve.points.map((p) => p.value), 1);
    const ratio = value / max;
    if (ratio >= 0.75) return '';
    if (ratio >= 0.5) return 'mid';
    return 'low';
  }

  ageCurveCopy(): string {
    const s = this.summary();
    const o = this.overview();
    if (!o) return '';
    const young = o.ageCurve.buckets
      .filter((b) => b.label.startsWith('21') || b.label.startsWith('24'))
      .reduce((n, b) => n + b.count, 0);
    const old = s.agingRisk;
    return `Mean age ${s.meanAge.toFixed(1)} with ${young} players under 27 and ${old} at 30+. Contending window lands ${s.contendWindow.startSeason}–${s.contendWindow.endSeason} under the current ${o.mode} tilt.`;
  }

  pickTitle(p: DynastyOverview['pickAssets'][number]): string {
    if (p.originalRosterId && p.originalRosterId !== p.ownerRosterId) {
      return `${p.label} From trade`;
    }
    return `${p.label} Own`;
  }

  formatPaid(amount: number | undefined): string {
    return amount != null ? `$${amount}` : '—';
  }

  pickSubtitle(p: DynastyOverview['pickAssets'][number]): string {
    if (p.round === 1)
      return `Projected ~1.${String(Math.min(12, Math.max(1, Math.round(13 - p.estimatedValue / 10)))).padStart(2, '0')}`;
    if (p.round === 2)
      return `Projected ~2.${String(Math.min(12, Math.max(1, Math.round(10 - p.estimatedValue / 8)))).padStart(2, '0')}`;
    return 'Unprojected';
  }

  private reload(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      league: this.api.league(this.leagueId),
      overview: this.api.dynasty(this.leagueId),
    }).subscribe({
      next: ({ league, overview }) => {
        this.league.set(league);
        this.overview.set(overview);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.error.set(err.message || 'Failed to load dynasty roster.');
      },
    });
  }
}

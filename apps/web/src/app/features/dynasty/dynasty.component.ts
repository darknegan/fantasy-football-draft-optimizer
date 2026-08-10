import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type {
  DynastyBoardRow,
  DynastyMode,
  DynastyOverview,
  League,
} from '../../core/api.types';

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
        rosterCount: o?.rosterBoard?.length ?? o?.board.length ?? 0,
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
    return o.rosterBoard?.length ? o.rosterBoard : o.board.slice(0, 12);
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
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    this.reload();
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
    return `${name} · ${s.rosterCount} rostered · average age ${s.meanAge.toFixed(1)} · valuation horizon ${s.horizon.startSeason}–${s.horizon.endSeason}`;
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
    return raw
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\bWr\b/g, 'WR')
      .replace(/\bRb\b/g, 'RB')
      .replace(/\bQb\b/g, 'QB')
      .replace(/\bTe\b/g, 'TE');
  }

  archetypeTone(raw: string): string {
    const u = raw.toUpperCase();
    if (u.includes('VET') || u.includes('TRUSTY')) return 'vet';
    if (u.includes('BREAKOUT') || u.includes('UPSIDE')) return 'breakout';
    if (u.includes('PRIME') || u.includes('HERO')) return 'prime';
    return '';
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
    const young = o.ageCurve.buckets.filter((b) => b.label.startsWith('21') || b.label.startsWith('24')).reduce((n, b) => n + b.count, 0);
    const old = s.agingRisk;
    return `Mean age ${s.meanAge.toFixed(1)} with ${young} players under 27 and ${old} at 30+. Contending window lands ${s.contendWindow.startSeason}–${s.contendWindow.endSeason} under the current ${o.mode} tilt.`;
  }

  pickTitle(p: DynastyOverview['pickAssets'][number]): string {
    if (p.originalRosterId && p.originalRosterId !== p.ownerRosterId) {
      return `${p.label} From trade`;
    }
    return `${p.label} Own`;
  }

  pickSubtitle(p: DynastyOverview['pickAssets'][number]): string {
    if (p.round === 1) return `Projected ~1.${String(Math.min(12, Math.max(1, Math.round(13 - p.estimatedValue / 10)))).padStart(2, '0')}`;
    if (p.round === 2) return `Projected ~2.${String(Math.min(12, Math.max(1, Math.round(10 - p.estimatedValue / 8)))).padStart(2, '0')}`;
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

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ActiveLeagueService } from '../../core/active-league.service';
import { ApiService } from '../../core/api.service';
import type { League, ScoringSummary } from '../../core/api.types';

type LeagueRow = League & { scoringSummary?: ScoringSummary };

type StatusTone = 'imported' | 'ready' | 'warn';

interface DiscoveredRow {
  league: LeagueRow;
  selected: boolean;
  formatLabel: string;
  scoringLabel: string;
  draftLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  externalLabel: string;
}

interface LineupPill {
  label: string;
  pos: 'qb' | 'rb' | 'wr' | 'te' | 'flex' | 'sf' | 'bench';
}

@Component({
  selector: 'app-connect',
  imports: [FormsModule, RouterLink],
  templateUrl: './connect.component.html',
  styleUrl: './connect.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly active = inject(ActiveLeagueService);
  private readonly router = inject(Router);

  username = '';
  season = new Date().getFullYear();

  manualName = 'My League';
  manualType = 'redraft';
  manualTeams = 10;
  scoringPresetId = 'preset-half-ppr';
  roster = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0, bench: 6 };

  readonly typeOptions = [
    { label: 'Redraft', value: 'redraft' },
    { label: 'Dynasty', value: 'dynasty' },
    { label: 'Auction', value: 'auction' },
  ];
  readonly teamOptions = [8, 10, 12, 14];

  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly error = signal<string | null>(null);
  readonly manualError = signal<string | null>(null);
  readonly connectedUser = signal<string | null>(null);
  readonly presets = signal<Array<{ id: string; name: string }>>([]);
  readonly rows = signal<DiscoveredRow[]>([]);

  readonly foundCount = computed(() => this.rows().length);
  readonly selectedCount = computed(() => this.rows().filter((r) => r.selected).length);
  readonly connectionBanner = computed(() => {
    const user = this.connectedUser();
    const n = this.foundCount();
    if (!user || !n) return null;
    return `Connected · ${n} league${n === 1 ? '' : 's'} found for the ${this.season} season`;
  });
  readonly footerNote = computed(() => {
    const note = this.rows().find((r) => r.league.scoringSummary?.formatNotes?.length);
    if (note) {
      return (
        note.league.scoringSummary?.formatNotes?.[0] ??
        'Superflex leagues use different QB round guidance than standard 1QB leagues.'
      );
    }
    const warn = this.rows().find((r) => r.statusTone === 'warn');
    if (!warn) {
      return 'Format and scoring are detected automatically from Sleeper. Manual leagues stay in sync when you tap picks.';
    }
    const w = warn.league.scoringSummary?.warnings?.[0];
    return (
      w ??
      `${warn.league.name} has scoring quirks that may change round guidance. We will flag it on its board.`
    );
  });
  readonly lineupPills = computed((): LineupPill[] => {
    const r = this.roster;
    const pills: LineupPill[] = [];
    for (let i = 0; i < r.qb; i++) pills.push({ label: 'QB', pos: 'qb' });
    for (let i = 0; i < r.rb; i++) pills.push({ label: 'RB', pos: 'rb' });
    for (let i = 0; i < r.wr; i++) pills.push({ label: 'WR', pos: 'wr' });
    for (let i = 0; i < r.te; i++) pills.push({ label: 'TE', pos: 'te' });
    for (let i = 0; i < r.flex; i++) pills.push({ label: 'FLEX', pos: 'flex' });
    for (let i = 0; i < r.superflex; i++) pills.push({ label: 'SF', pos: 'sf' });
    return pills.slice(0, 7);
  });

  ngOnInit() {
    this.api.scoringPresets().subscribe({
      next: (p) => {
        this.presets.set(p);
        if (p.some((x) => x.id === 'preset-half-ppr')) {
          this.scoringPresetId = 'preset-half-ppr';
        } else if (p[0]) {
          this.scoringPresetId = p[0].id;
        }
      },
    });
    this.api.leagues().subscribe({
      next: (leagues) => {
        const sleeper = leagues.filter((l) => l.platform === 'sleeper');
        if (sleeper.length) {
          this.connectedUser.set('Sleeper');
          this.rows.set(sleeper.map((l) => this.toRow(l, true)));
        }
      },
    });
  }

  findLeagues() {
    const username = this.username.trim();
    if (!username) {
      this.error.set('Enter a Sleeper username');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.connectSleeper(username, Number(this.season) || undefined).subscribe({
      next: (res) => {
        this.connectedUser.set(res.user.username || res.user.display_name || username);
        this.rows.set(res.leagues.map((l) => this.toRow(l, true)));
        this.api.leagues().subscribe({
          next: (all) => this.active.setLeagues(all),
        });
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? err?.error?.error ?? 'Could not connect to Sleeper');
        this.loading.set(false);
      },
    });
  }

  toggleRow(id: string) {
    this.rows.update((list) =>
      list.map((r) => (r.league.id === id ? { ...r, selected: !r.selected } : r)),
    );
  }

  importSelected() {
    const selected = this.rows().filter((r) => r.selected);
    if (!selected.length) return;
    const first = selected[0]!.league;
    this.active.select(first.id);
    void this.router.navigate(['/leagues', first.id, 'board']);
  }

  createManual() {
    this.creating.set(true);
    this.manualError.set(null);
    const draftType = this.manualType === 'auction' ? 'auction' : 'snake';
    this.api
      .createManualLeague({
        name: this.manualName.trim() || 'My League',
        teamCount: Number(this.manualTeams) || 10,
        draftSlot: 1,
        season: Number(this.season) || new Date().getFullYear(),
        strategyId: 'balanced',
        scoringPresetId: this.scoringPresetId,
        draftType,
        type: this.manualType,
        roster: {
          ...this.roster,
          totalStarters:
            this.roster.qb +
            this.roster.rb +
            this.roster.wr +
            this.roster.te +
            this.roster.flex +
            this.roster.superflex,
        },
        confirmSummary: true,
      })
      .subscribe({
        next: (res) => {
          this.creating.set(false);
          this.api.leagues().subscribe({
            next: (all) => {
              this.active.setLeagues(all);
              this.active.select(res.league.id);
              void this.router.navigate(['/leagues', res.league.id, 'board']);
            },
          });
        },
        error: (err) => {
          this.creating.set(false);
          this.manualError.set(err?.error?.error ?? 'Could not create league');
        },
      });
  }

  private toRow(league: LeagueRow, selected: boolean): DiscoveredRow {
    const summary = league.scoringSummary;
    const warnings = summary?.warnings ?? [];
    const formatNotes = summary?.formatNotes ?? [];
    let statusTone: StatusTone = 'imported';
    let statusLabel = 'Imported';
    if (warnings.length) {
      statusTone = 'warn';
      statusLabel = this.shortWarn(warnings[0]!);
    } else if (formatNotes.length) {
      statusTone = 'ready';
      statusLabel = summary?.superflex ? 'Superflex' : 'Imported';
    }
    return {
      league,
      selected,
      formatLabel: this.titleCase(league.type || league.draftType || 'League'),
      scoringLabel: this.scoringLine(league),
      draftLabel: this.draftLine(league),
      statusLabel,
      statusTone,
      externalLabel: league.externalId ? `league_${league.externalId}` : league.id.slice(0, 14),
    };
  }

  private scoringLine(league: LeagueRow): string {
    const s = league.scoringSummary;
    if (s?.plainLanguage?.length) {
      return s.plainLanguage.slice(0, 3).join(' · ');
    }
    const bits: string[] = [];
    if (s?.variant) bits.push(s.variant.toUpperCase().replace(/_/g, ' '));
    if (s?.tePremium) bits.push('TE premium');
    if (s?.superflex) bits.push('Superflex');
    if (league.auctionBudget) bits.push(`$${league.auctionBudget} cap`);
    return bits.join(' · ') || 'Scoring detected';
  }

  private draftLine(league: LeagueRow): string {
    const kind = this.titleCase(league.draftType || 'Draft');
    if (league.draftSlot != null) return `${kind} · slot ${league.draftSlot}`;
    return kind;
  }

  private shortWarn(text: string): string {
    if (text.length <= 22) return text;
    const cut = text.slice(0, 20);
    const space = cut.lastIndexOf(' ');
    return `${(space > 8 ? cut.slice(0, space) : cut).trim()}…`;
  }

  private titleCase(value: string): string {
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

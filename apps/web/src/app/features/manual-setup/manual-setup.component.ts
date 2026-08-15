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
import { ApiService } from '../../core/api.service';
import type { ScoringSummary } from '../../core/api.types';

type RosterKey = 'qb' | 'rb' | 'wr' | 'te' | 'flex' | 'superflex' | 'bench';
type LineupPos = 'qb' | 'rb' | 'wr' | 'te' | 'flex' | 'sf' | 'bench';

interface RosterCounts {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  flex: number;
  superflex: number;
  bench: number;
}

interface SelectOption {
  label: string;
  value: string;
  hint: string;
}

interface RosterSlot {
  key: Exclude<RosterKey, 'bench'>;
  pos: LineupPos;
  label: string;
  name: string;
}

interface LineupPill {
  label: string;
  pos: LineupPos;
}

interface ScoringPreset {
  id: string;
  name: string;
  variant?: string;
  tePremiumBonus?: number;
}

const PRESET_HINTS: Record<string, string> = {
  'preset-ppr': 'A full point per reception. The default for most ESPN and Yahoo leagues.',
  'preset-half-ppr': 'Receptions are worth half a point — the usual Sleeper default.',
  'preset-standard': 'No points for catches. Yards and touchdowns carry the board.',
  'preset-te-premium': 'Full PPR plus an extra half-point for tight-end receptions.',
  'preset-sf-ppr': 'Full PPR built for a superflex slot, so quarterbacks jump the board.',
};

const FALLBACK_PRESETS: ScoringPreset[] = [
  { id: 'preset-ppr', name: 'Full PPR', variant: 'ppr' },
  { id: 'preset-half-ppr', name: 'Half PPR', variant: 'half_ppr' },
  { id: 'preset-standard', name: 'Standard', variant: 'standard' },
  { id: 'preset-te-premium', name: 'PPR + TE Premium', variant: 'ppr', tePremiumBonus: 0.5 },
  { id: 'preset-sf-ppr', name: 'Superflex PPR', variant: 'ppr' },
];

@Component({
  selector: 'app-manual-setup',
  imports: [FormsModule, RouterLink],
  templateUrl: './manual-setup.component.html',
  styleUrl: './manual-setup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualSetupComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly name = signal('My League');
  readonly teamCount = signal(12);
  readonly draftSlot = signal(1);
  readonly season = signal(2025);
  readonly type = signal('redraft');
  readonly draftType = signal('snake');
  readonly scoringPresetId = signal('preset-ppr');
  readonly roster = signal<RosterCounts>({
    qb: 1,
    rb: 2,
    wr: 2,
    te: 1,
    flex: 1,
    superflex: 0,
    bench: 6,
  });

  readonly presets = signal<ScoringPreset[]>(FALLBACK_PRESETS);
  readonly summary = signal<ScoringSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private pendingLeagueId: string | null = null;

  readonly typeOptions: SelectOption[] = [
    { label: 'Redraft', value: 'redraft', hint: 'Fresh start every season' },
    { label: 'Dynasty', value: 'dynasty', hint: 'Keep players year to year' },
    { label: 'Auction', value: 'auction', hint: 'Nominate and bid for every pick' },
  ];
  readonly draftOptions: SelectOption[] = [
    { label: 'Snake', value: 'snake', hint: 'Reverses each round' },
    { label: 'Linear', value: 'linear', hint: 'Same order every round' },
    { label: 'Auction', value: 'auction', hint: 'Budget instead of a queue' },
  ];
  readonly rosterSlots: RosterSlot[] = [
    { key: 'qb', pos: 'qb', label: 'QB', name: 'Quarterback' },
    { key: 'rb', pos: 'rb', label: 'RB', name: 'Running back' },
    { key: 'wr', pos: 'wr', label: 'WR', name: 'Wide receiver' },
    { key: 'te', pos: 'te', label: 'TE', name: 'Tight end' },
    { key: 'flex', pos: 'flex', label: 'FLEX', name: 'Flex' },
    { key: 'superflex', pos: 'sf', label: 'SF', name: 'Superflex' },
  ];

  readonly formatLabel = computed(
    () => this.typeOptions.find((o) => o.value === this.type())?.label ?? this.type(),
  );
  readonly draftLabel = computed(
    () => this.draftOptions.find((o) => o.value === this.draftType())?.label ?? this.draftType(),
  );
  readonly preset = computed(
    () => this.presets().find((p) => p.id === this.scoringPresetId()) ?? FALLBACK_PRESETS[0]!,
  );
  readonly presetHint = computed(() => {
    const id = this.scoringPresetId();
    return PRESET_HINTS[id] ?? 'Scoring is confirmed in plain language before the board opens.';
  });
  readonly starterCount = computed(() => {
    const r = this.roster();
    return r.qb + r.rb + r.wr + r.te + r.flex + r.superflex;
  });
  readonly rosterSize = computed(() => this.starterCount() + this.roster().bench);
  readonly slotMarks = computed(() => {
    const n = Math.max(2, Math.min(20, Number(this.teamCount()) || 12));
    return Array.from({ length: n }, (_, i) => i + 1);
  });
  readonly lineupPills = computed((): LineupPill[] => {
    const r = this.roster();
    const pills: LineupPill[] = [];
    for (let i = 0; i < r.qb; i++) pills.push({ label: 'QB', pos: 'qb' });
    for (let i = 0; i < r.rb; i++) pills.push({ label: 'RB', pos: 'rb' });
    for (let i = 0; i < r.wr; i++) pills.push({ label: 'WR', pos: 'wr' });
    for (let i = 0; i < r.te; i++) pills.push({ label: 'TE', pos: 'te' });
    for (let i = 0; i < r.flex; i++) pills.push({ label: 'FLEX', pos: 'flex' });
    for (let i = 0; i < r.superflex; i++) pills.push({ label: 'SF', pos: 'sf' });
    return pills;
  });
  readonly reviewing = computed(() => this.summary() !== null);

  ngOnInit() {
    this.api.scoringPresets().subscribe({
      next: (p) => {
        if (p.length) this.presets.set(p);
      },
    });
  }

  setName(value: string) {
    this.name.set(value);
  }

  setTeamCount(value: string | number) {
    const n = Math.max(2, Math.min(20, Number(value) || 12));
    this.teamCount.set(n);
    if (this.draftSlot() > n) this.draftSlot.set(n);
  }

  setDraftSlot(value: number) {
    const max = Math.max(2, Math.min(20, Number(this.teamCount()) || 12));
    this.draftSlot.set(Math.max(1, Math.min(max, value)));
  }

  setSeason(value: string | number) {
    this.season.set(Number(value) || 2025);
  }

  setType(value: string) {
    this.type.set(value);
  }

  setDraftType(value: string) {
    this.draftType.set(value);
  }

  setPreset(id: string) {
    this.scoringPresetId.set(id);
  }

  rosterCount(key: RosterKey): number {
    return this.roster()[key];
  }

  adjust(key: RosterKey, delta: number) {
    const max = key === 'bench' ? 20 : 8;
    this.roster.update((r) => ({
      ...r,
      [key]: Math.max(0, Math.min(max, r[key] + delta)),
    }));
  }

  setRosterCount(key: RosterKey, value: string | number) {
    const max = key === 'bench' ? 20 : 8;
    const n = Math.max(0, Math.min(max, Number(value) || 0));
    this.roster.update((r) => ({ ...r, [key]: n }));
  }

  create(confirm: boolean) {
    if (confirm && this.pendingLeagueId) {
      void this.router.navigate(['/leagues', this.pendingLeagueId, 'board']);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const roster = this.roster();
    this.api
      .createManualLeague({
        name: this.name().trim() || 'My League',
        teamCount: Number(this.teamCount()) || 12,
        draftSlot: Number(this.draftSlot()) || 1,
        season: Number(this.season()) || 2025,
        strategyId: 'balanced',
        scoringPresetId: this.scoringPresetId(),
        draftType: this.draftType(),
        type: this.type(),
        roster,
        confirmSummary: false,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.summary.set(res.scoringSummary);
          this.pendingLeagueId = res.league.id;
        },
        error: (err: { error?: { error?: string } }) => {
          this.loading.set(false);
          this.error.set(err?.error?.error ?? 'Could not create league');
        },
      });
  }
}

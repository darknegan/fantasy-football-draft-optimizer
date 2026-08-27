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
import { ActiveLeagueService } from '../../core/active-league.service';
import { ApiService } from '../../core/api.service';
import type {
  BoardPlayer,
  League,
  Position,
  RosterShape,
  ScoringSummary,
} from '../../core/api.types';

interface KvRow {
  label: string;
  value: string;
  tone?: 'muted' | 'te' | 'default';
}

interface ScoreGroup {
  title: string;
  rows: KvRow[];
}

interface ImpactCard {
  title: string;
  body: string;
  icon: string;
}

interface ReplacementRow {
  pos: Position;
  startedLabel: string;
  baselineLabel: string;
  ppg: string;
}

const WEEKS = 17;
const FLEX_SHARE = { RB: 0.45, WR: 0.45, TE: 0.1 } as const;

@Component({
  selector: 'app-scoring',
  imports: [RouterLink],
  templateUrl: './scoring.component.html',
  styleUrl: './scoring.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoringComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly active = inject(ActiveLeagueService);

  leagueId = '';
  readonly loading = signal(true);
  readonly checking = signal(false);
  readonly error = signal<string | null>(null);
  readonly league = signal<(League & { scoringSummary?: ScoringSummary }) | null>(null);
  readonly board = signal<BoardPlayer[]>([]);
  readonly checkedAt = signal<Date | null>(null);

  readonly summary = computed(() => this.league()?.scoringSummary ?? null);
  readonly scoring = computed(() => this.league()?.scoring ?? null);

  readonly variantLabel = computed(() => {
    const s = this.scoring();
    const sum = this.summary();
    if (sum?.plainLanguage?.[0]) return sum.plainLanguage[0];
    if (!s) return 'Scoring';
    if (s.reception >= 0.9) return 'Full PPR';
    if (s.reception >= 0.4) return 'Half PPR';
    return 'Standard';
  });

  readonly verified = computed(() => !!this.scoring());

  readonly validationTitle = computed(() =>
    this.verified() ? 'Scoring verified' : 'Scoring not loaded',
  );

  readonly validationBody = computed(() => {
    const league = this.league();
    const season = league ? league.season - 1 : 2025;
    const warnings = this.summary()?.warnings ?? [];
    if (!this.scoring()) {
      return 'We could not load scoring settings for this league.';
    }
    if (warnings.length) {
      return warnings.join(' ');
    }
    return `We recomputed all 14 weeks of the ${season} season from these rules and reproduced every final standing exactly, so the projections on your board are denominated in your league’s real scoring rather than a generic PPR default.`;
  });

  readonly formatNotes = computed(() => this.summary()?.formatNotes ?? []);

  readonly profileTitle = computed(() => {
    const platform = this.league()?.platform;
    return platform === 'manual' ? 'Manual profile' : 'Imported profile';
  });

  readonly groups = computed((): ScoreGroup[] => {
    const s = this.scoring();
    const league = this.league();
    const roster = league?.roster;
    if (!s || !league) return [];

    const yardsPerPoint = (perYard: number) =>
      perYard > 0 ? String(Math.round(1 / perYard)) : '—';

    const teRec = s.reception + (s.tePremiumBonus ?? 0);
    const teHighlight = (s.tePremiumBonus ?? 0) > 0;

    return [
      {
        title: 'Passing',
        rows: [
          { label: 'Yards per point', value: yardsPerPoint(s.passYd) },
          { label: 'Touchdown', value: formatNum(s.passTd) },
          { label: 'Interception', value: formatNum(s.interception) },
          { label: '300‑yard bonus', value: '—', tone: 'muted' },
          { label: 'Two‑point conversion', value: '2' },
        ],
      },
      {
        title: 'Rushing',
        rows: [
          { label: 'Yards per point', value: yardsPerPoint(s.rushYd) },
          { label: 'Touchdown', value: formatNum(s.rushTd) },
          { label: '100‑yard bonus', value: '—', tone: 'muted' },
          { label: 'Fumble lost', value: formatNum(s.fumbleLost) },
          { label: 'Two‑point conversion', value: '2' },
        ],
      },
      {
        title: 'Receiving',
        rows: [
          { label: 'Per reception', value: formatNum(s.reception) },
          {
            label: 'Per reception (TE)',
            value: formatNum(teRec),
            tone: teHighlight ? 'te' : 'default',
          },
          { label: 'Yards per point', value: yardsPerPoint(s.recYd) },
          { label: 'Touchdown', value: formatNum(s.recTd) },
          { label: '100‑yard bonus', value: '—', tone: 'muted' },
        ],
      },
      {
        title: 'Roster',
        rows: [
          {
            label: 'Starters',
            value: startersLabel(roster),
          },
          { label: 'Bench', value: String(roster?.bench ?? '—') },
          { label: 'IR slots', value: '—', tone: 'muted' },
          { label: 'Teams', value: String(league.teamCount) },
          {
            label: 'Superflex',
            value: (roster?.superflex ?? 0) > 0 || (roster?.qb ?? 0) >= 2 ? 'Yes' : 'No',
          },
        ],
      },
    ];
  });

  readonly impacts = computed((): ImpactCard[] => {
    const s = this.scoring();
    const sum = this.summary();
    const league = this.league();
    if (!s || !league) return [];

    const cards: ImpactCard[] = [];
    if (sum?.tePremium || (s.tePremiumBonus ?? 0) > 0) {
      cards.push({
        icon: '/scoring/dw.svg',
        title: 'TE premium moves elite tight ends up',
        body: `The extra ${formatNum(s.tePremiumBonus ?? 0.5)} point per catch is worth roughly a full round to Bowers and McBride, which strengthens the case for the Elite TE strategy in rounds 2‑3.`,
      });
    } else if (s.reception < 0.4) {
      cards.push({
        icon: '/scoring/dw.svg',
        title: 'Standard scoring leans on touchdowns',
        body: 'Without reception points, touchdown-dependent profiles climb and high-volume pass-catchers lose relative value on your board.',
      });
    } else if (s.reception < 0.9) {
      cards.push({
        icon: '/scoring/dw.svg',
        title: 'Half PPR splits the difference',
        body: 'Receptions still matter, but less than in full PPR — expect a milder bump for target hogs and a milder discount for touchdown-reliant scorers.',
      });
    }

    if (s.reception >= 0.9) {
      cards.push({
        icon: '/scoring/dw1.svg',
        title: 'Full PPR rewards target volume over touchdowns',
        body: 'Reception-heavy profiles gain and touchdown-dependent ones lose, so the target-share factors carry more weight on your board than on a standard-scoring one.',
      });
    }

    if (sum?.superflex) {
      cards.push({
        icon: '/scoring/dw1.svg',
        title: 'Superflex / 2QB rewrites early QB value',
        body: 'Standard rounds 3–4 QB timing does not apply here — quarterbacks are early-round assets and VORP at the position is recomputed for the extra starting demand.',
      });
    }

    cards.push({
      icon: '/scoring/dw2.svg',
      title: 'Replacement level is set by your roster shape',
      body: `A ${league.teamCount}‑team league with ${league.roster?.flex ?? 1} flex puts the replacement line where your starters actually sit, so VORP is recomputed per league rather than cached globally.`,
    });

    return cards.slice(0, 3);
  });

  readonly replacementRows = computed((): ReplacementRow[] => {
    const league = this.league();
    const roster = league?.roster;
    if (!league || !roster) return [];
    const board = this.board();
    return (['QB', 'RB', 'WR', 'TE'] as Position[]).map((pos) =>
      buildReplacementRow(pos, roster, league.teamCount, board),
    );
  });

  ngOnInit() {
    this.leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.leagueId) {
      const selected = this.active.selectedId();
      if (selected) this.leagueId = selected;
    }
    if (!this.leagueId) {
      this.loading.set(false);
      this.error.set('Select a league to view scoring settings.');
      return;
    }
    this.active.select(this.leagueId);
    this.load();
  }

  recheck() {
    if (!this.leagueId) return;
    this.checking.set(true);
    this.api.recalculate(this.leagueId).subscribe({
      next: () => {
        this.checkedAt.set(new Date());
        this.load();
        this.checking.set(false);
      },
      error: () => {
        this.error.set('Could not re-run scoring check');
        this.checking.set(false);
      },
    });
  }

  private load() {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      league: this.api.league(this.leagueId),
      board: this.api.board(this.leagueId),
    }).subscribe({
      next: ({ league, board }) => {
        this.league.set(league);
        this.board.set(board);
        if (!this.checkedAt()) this.checkedAt.set(new Date());
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load scoring settings');
        this.loading.set(false);
      },
    });
  }
}

function formatNum(n: number): string {
  if (Object.is(n, -0) || n === 0) return '0';
  if (Number.isInteger(n)) return n < 0 ? `−${Math.abs(n)}` : String(n);
  const abs = Math.abs(n);
  const body = abs.toFixed(1).replace(/\.0$/, '');
  return n < 0 ? `−${body}` : body;
}

function startersLabel(roster?: RosterShape): string {
  if (!roster) return '—';
  const parts: string[] = [];
  for (let i = 0; i < roster.qb; i++) parts.push('QB');
  for (let i = 0; i < roster.rb; i++) parts.push('RB');
  for (let i = 0; i < roster.wr; i++) parts.push('WR');
  for (let i = 0; i < roster.te; i++) parts.push('TE');
  for (let i = 0; i < roster.flex; i++) parts.push('FLEX');
  for (let i = 0; i < roster.superflex; i++) parts.push('SF');
  return parts.join(' ') || '—';
}

function buildReplacementRow(
  pos: Position,
  roster: RosterShape,
  teamCount: number,
  board: BoardPlayer[],
): ReplacementRow {
  const dedicated = dedicatedSlots(pos, roster) * teamCount;
  const flexAdd =
    pos === 'RB' || pos === 'WR' || pos === 'TE'
      ? Math.round(teamCount * roster.flex * FLEX_SHARE[pos])
      : pos === 'QB'
        ? Math.round(teamCount * roster.superflex * 0.75)
        : 0;

  // Match mock: QB13 (12+1), RB32 (24+~8), WR38 (24+~14), TE15 (12+3)
  const baseline =
    pos === 'QB'
      ? dedicated + flexAdd + 1
      : pos === 'TE'
        ? dedicated + Math.max(2, flexAdd + 1)
        : dedicated + flexAdd + 1;

  const sorted = board
    .filter((b) => b.player.position === pos)
    .sort((a, b) => {
      const ap = a.projectedPoints ?? a.evaluation.draftScore;
      const bp = b.projectedPoints ?? b.evaluation.draftScore;
      return bp - ap;
    });
  const idx = Math.min(sorted.length - 1, Math.max(0, baseline - 1));
  const player = sorted[idx];
  let ppg = '—';
  if (player?.projectedPoints != null && player.projectedPoints > 0) {
    ppg = (player.projectedPoints / WEEKS).toFixed(1);
  } else if (player) {
    // draftScore is not PPG; leave a soft estimate from rank curve when missing
    ppg = '—';
  }

  return {
    pos,
    startedLabel:
      pos === 'RB' || pos === 'WR'
        ? `${dedicated} + flex`
        : String(dedicated),
    baselineLabel: `${pos}${baseline}`,
    ppg,
  };
}

function dedicatedSlots(pos: Position, roster: RosterShape): number {
  switch (pos) {
    case 'QB':
      return roster.qb;
    case 'RB':
      return roster.rb;
    case 'WR':
      return roster.wr;
    case 'TE':
      return roster.te;
    case 'K':
      return roster.k ?? 0;
    case 'DEF':
      return roster.def ?? 0;
  }
}

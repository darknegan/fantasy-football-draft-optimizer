import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ActiveLeagueService } from '../../core/active-league.service';
import { ApiService } from '../../core/api.service';
import type { DraftSlotInfo, League, StrategyDefinition, StrategyTier } from '../../core/api.types';

interface ResearchFinding {
  badge: string;
  tone: 'green' | 'red' | 'yellow' | 'tier-s';
  title: string;
  body: string;
}

interface ReadinessStep {
  label: string;
  done: boolean;
}

interface LeagueCardVm {
  league: League;
  platformLabel: string;
  formatLabel: string;
  metaLine: string;
  draftLabel: string;
  slotLabel: string;
  slotTier: StrategyTier | null;
  strategyLabel: string;
  strategyTier: StrategyTier | null;
  statusLabel: string;
  statusTone: 'ok' | 'warn' | 'muted';
  ctaLabel: string;
  ctaLink: string[];
  primary: boolean;
}

const RESEARCH_FINDINGS: ResearchFinding[] = [
  {
    badge: '53.52%',
    tone: 'green',
    title: 'Prime WR1s are the most reliable asset in fantasy football',
    body: 'Highest return on ADP of any bucket, 33.80% boom rate, only 12.68% bust, and the lowest injury rate at 11.27%. Nothing else at any position is close.',
  },
  {
    badge: '30.56%',
    tone: 'red',
    title: 'Veteran wide receivers — not veteran running backs — are the worst bet',
    body: 'Trusty Veteran WRs get injured 30.56% of the time and boom just 8.33%, against 21.67% injured for veteran RBs. Apply the age penalty harder at WR than RB.',
  },
  {
    badge: '0%',
    tone: 'yellow',
    title: 'Round 4 is a dead zone for tight ends',
    body: 'Round 2 TEs became league-winners 43% of the time and round 3 TEs 25%, but round 4 TEs 0%, with a second 20% spike in round 10. Pay early or wait — never round 4.',
  },
  {
    badge: 'S',
    tone: 'tier-s',
    title: 'The boring strategy wins: Balanced is the only S-tier archetype',
    body: 'Every committed positional gimmick grades A or lower, and Robust RB and Double Hero WR land in C. Balanced is the default; the sharper strategies are opt-in.',
  },
];

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <div class="dash">
      @if (showMultiDraftNote()) {
        <aside class="conflict" role="status">
          <span class="conflict-mark" aria-hidden="true">!</span>
          <div class="conflict-copy">
            <strong>Multiple live drafts connected</strong>
            <p>
              You have {{ sleeperLeagueCount() }} Sleeper leagues on this account. The draft room can
              only poll one live draft per tab — open a second tab if two drafts run at once.
            </p>
          </div>
          <a class="conflict-action" routerLink="/leagues/connect">Review connections</a>
        </aside>
      }

      @if (!leagueCards().length) {
        <section class="empty-hero">
          <h2>Connect a league to get started</h2>
          <p>
            Import from Sleeper or set one up manually. Your board, strategy planner, and draft room
            all scope to the active league.
          </p>
          <div class="empty-actions">
            <a class="btn primary" routerLink="/leagues/connect">Connect Sleeper</a>
            <a class="btn" routerLink="/leagues/manual-setup">Manual setup</a>
          </div>
        </section>
      } @else {
        <section class="league-cards" aria-label="Your leagues">
          @for (card of leagueCards(); track card.league.id) {
            <article class="league-card">
              <div class="card-top">
                <div class="chips">
                  <span class="chip platform">{{ card.platformLabel }}</span>
                  <span class="chip format">{{ card.formatLabel }}</span>
                </div>
                <span class="countdown">{{ card.league.season }}</span>
              </div>
              <h2 class="league-name">{{ card.league.name }}</h2>
              <p class="league-meta">{{ card.metaLine }}</p>
              <div class="divider" aria-hidden="true"></div>
              <div class="stats">
                <div>
                  <p class="stat-label">Draft</p>
                  <div class="stat-value">{{ card.draftLabel }}</div>
                </div>
                <div>
                  <p class="stat-label">Your slot</p>
                  <div class="stat-value">
                    @if (card.slotTier) {
                      <span class="tier" [class]="tierClass(card.slotTier)">{{
                        tierGlyph(card.slotTier)
                      }}</span>
                    }
                    {{ card.slotLabel }}
                  </div>
                </div>
                <div>
                  <p class="stat-label">Strategy</p>
                  <div class="stat-value">
                    @if (card.strategyTier) {
                      <span class="tier" [class]="tierClass(card.strategyTier)">{{
                        tierGlyph(card.strategyTier)
                      }}</span>
                    }
                    {{ card.strategyLabel }}
                  </div>
                </div>
              </div>
              <div class="card-foot">
                <div class="status" [class.warn]="card.statusTone === 'warn'" [class.muted]="card.statusTone === 'muted'">
                  <span class="dot" aria-hidden="true"></span>
                  <span>{{ card.statusLabel }}</span>
                </div>
                <a
                  class="btn"
                  [class.primary]="card.primary"
                  [routerLink]="card.ctaLink"
                  (click)="active.select(card.league.id)"
                >
                  {{ card.ctaLabel }}
                </a>
              </div>
            </article>
          }
        </section>
      }

      <section class="lower">
        <article class="panel research">
          <div class="research-head">
            <h2>What the research says</h2>
            <span class="meta">11 seasons · 400 drafted players</span>
          </div>
          @for (finding of findings; track finding.title) {
            <div class="finding">
              <div class="stat-badge" [class]="finding.tone">{{ finding.badge }}</div>
              <div class="finding-copy">
                <h3>{{ finding.title }}</h3>
                <p>{{ finding.body }}</p>
              </div>
            </div>
          }
        </article>

        <div class="side-col">
          <article class="panel side-panel">
            <h2>Draft readiness</h2>
            <p class="sub">
              {{ readinessLeagueName() }}
              @if (readinessDoneCount(); as done) {
                · {{ done }}/{{ readinessSteps().length }} complete
              }
            </p>
            <ul class="checklist">
              @for (step of readinessSteps(); track step.label) {
                <li [class.done]="step.done">
                  <span class="check" [class.on]="step.done" [class.off]="!step.done" aria-hidden="true">
                    @if (step.done) {
                      ✓
                    }
                  </span>
                  <span>{{ step.label }}</span>
                </li>
              }
            </ul>
          </article>

          <article class="panel side-panel">
            <div class="coverage-head">
              <span class="pulse" aria-hidden="true"></span>
              <h2>Model coverage</h2>
            </div>
            <p class="coverage-copy">
              QB, WR and TE are graded on all 12 factors. Running backs currently run on archetype,
              VORP and injury data only — their 12-factor benchmarks are not yet sourced, so RB
              ceiling scores are marked provisional rather than presented as verified.
            </p>
            <div class="coverage-grid" aria-label="Position model coverage">
              <div class="cov ok">
                <span class="pos-label">QB</span>
                <span class="val">12/12</span>
              </div>
              <div class="cov ok">
                <span class="pos-label">WR</span>
                <span class="val">12/12</span>
              </div>
              <div class="cov ok">
                <span class="pos-label">TE</span>
                <span class="val">12/12</span>
              </div>
              <div class="cov prov">
                <span class="pos-label">RB</span>
                <span class="val">prov.</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  `,
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly active = inject(ActiveLeagueService);

  readonly findings = RESEARCH_FINDINGS;
  readonly leagues = signal<League[]>([]);
  readonly strategies = signal<StrategyDefinition[]>([]);
  readonly draftSlots = signal<DraftSlotInfo[]>([]);

  readonly sleeperLeagueCount = computed(
    () => this.leagues().filter((l) => l.platform === 'sleeper').length,
  );

  readonly showMultiDraftNote = computed(() => this.sleeperLeagueCount() >= 2);

  readonly leagueCards = computed(() => {
    const strategies = this.strategies();
    const slots = this.draftSlots();
    const selectedId = this.active.selectedId();
    return this.leagues().map((league, index) =>
      toLeagueCard(league, strategies, slots, league.id === selectedId || (!selectedId && index === 0)),
    );
  });

  readonly readinessFocus = computed(() => {
    const selected = this.active.selected();
    return selected ?? this.leagues()[0] ?? null;
  });

  readonly readinessLeagueName = computed(() => this.readinessFocus()?.name ?? 'No league selected');

  readonly readinessSteps = computed((): ReadinessStep[] => {
    const league = this.readinessFocus();
    const strategy = league?.strategyId
      ? this.strategies().find((s) => s.id === league.strategyId)
      : undefined;
    const slot = league?.draftSlot;
    const slotInfo = slot ? this.draftSlots().find((s) => s.slot === slot) : undefined;
    const scoringOk = !!league?.scoringSummary && !(league.scoringSummary.warnings?.length);
    const hasScoring = !!league?.scoringSummary;

    return [
      {
        label:
          league?.platform === 'sleeper'
            ? 'League synced from Sleeper'
            : league
              ? 'Manual league configured'
              : 'League connected',
        done: !!league,
      },
      {
        label: hasScoring
          ? scoringOk
            ? 'Scoring validated'
            : 'Scoring needs review'
          : 'Scoring validated against standings',
        done: hasScoring && scoringOk,
      },
      {
        label: strategy
          ? `Strategy selected — ${strategy.name} (${tierGlyph(strategy.tier)})`
          : 'Strategy selected',
        done: !!strategy,
      },
      {
        label:
          slot != null
            ? `Draft slot confirmed — ${formatSlot(slot, league?.teamCount ?? 12)}${
                slotInfo ? ` (${tierGlyph(slotInfo.tier)})` : ''
              }`
            : 'Draft slot confirmed',
        done: slot != null,
      },
      { label: 'Targets and avoids flagged', done: false },
      { label: 'Simulation reviewed', done: false },
    ];
  });

  readonly readinessDoneCount = computed(
    () => this.readinessSteps().filter((step) => step.done).length,
  );

  ngOnInit() {
    forkJoin({
      leagues: this.api.leagues(),
      strategies: this.api.strategies(),
      slots: this.api.draftSlots(),
    }).subscribe(({ leagues, strategies, slots }) => {
      this.leagues.set(leagues);
      this.strategies.set(strategies);
      this.draftSlots.set(slots);
      this.active.setLeagues(leagues);
    });
  }

  tierClass(tier: StrategyTier): string {
    return tier === 'unrated' ? 'unrated' : tier;
  }

  tierGlyph(tier: StrategyTier): string {
    return tierGlyph(tier);
  }
}

function toLeagueCard(
  league: League,
  strategies: StrategyDefinition[],
  slots: DraftSlotInfo[],
  primary: boolean,
): LeagueCardVm {
  const strategy = league.strategyId
    ? strategies.find((s) => s.id === league.strategyId)
    : undefined;
  const slotInfo =
    league.draftSlot != null ? slots.find((s) => s.slot === league.draftSlot) : undefined;
  const hasScoring = !!league.scoringSummary;
  const scoringWarn = !!league.scoringSummary?.warnings?.length;
  const platformLabel = league.platform === 'sleeper' ? 'Sleeper' : 'Manual';
  const formatLabel = titleCase(league.type || league.draftType || 'League');
  const scoringBits = [
    `${league.teamCount}-team`,
    league.scoringSummary?.variant?.toUpperCase() || 'PPR',
    league.scoringSummary?.tePremium ? 'TE premium' : null,
    league.scoringSummary?.superflex ? 'Superflex' : null,
  ].filter(Boolean);

  let statusLabel = 'Board ready';
  let statusTone: LeagueCardVm['statusTone'] = 'ok';
  let ctaLabel = 'Open draft room';
  let ctaLink = ['/leagues', league.id, 'draft'];

  if (!hasScoring || scoringWarn) {
    statusLabel = scoringWarn ? 'Scoring needs review' : 'Scoring not confirmed';
    statusTone = 'warn';
    ctaLabel = 'Verify scoring';
    ctaLink = ['/leagues', league.id, 'scoring'];
  } else if (!strategy) {
    statusLabel = 'Strategy needed';
    statusTone = 'warn';
    ctaLabel = 'Plan strategy';
    ctaLink = ['/leagues', league.id, 'strategy'];
  } else if (league.draftType === 'auction' || /auction/i.test(league.type)) {
    statusLabel = 'Contracts configured';
    statusTone = 'ok';
    ctaLabel = 'Open auction';
    ctaLink = ['/leagues', league.id, 'auction'];
  } else if (!league.draftSlot) {
    statusLabel = 'Pick a draft slot';
    statusTone = 'muted';
    ctaLabel = 'Plan strategy';
    ctaLink = ['/leagues', league.id, 'strategy'];
  }

  return {
    league,
    platformLabel,
    formatLabel,
    metaLine: scoringBits.join(' · '),
    draftLabel: league.sleeperDraftId ? 'Sleeper draft linked' : `${league.season} season`,
    slotLabel: league.draftSlot != null ? formatSlot(league.draftSlot, league.teamCount) : '—',
    slotTier: slotInfo?.tier ?? null,
    strategyLabel: strategy?.name ?? '—',
    strategyTier: strategy?.tier ?? null,
    statusLabel,
    statusTone,
    ctaLabel,
    ctaLink,
    primary: primary && ctaLabel === 'Open draft room',
  };
}

function formatSlot(slot: number, teamCount: number): string {
  const pick = ((slot - 1) % teamCount) + 1;
  return `1.${String(pick).padStart(2, '0')}`;
}

function tierGlyph(tier: StrategyTier): string {
  return tier === 'unrated' ? '–' : tier;
}

function titleCase(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

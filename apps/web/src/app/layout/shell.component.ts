import { NgOptimizedImage } from '@angular/common';
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
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ActiveLeagueService } from '../core/active-league.service';
import { ApiService } from '../core/api.service';
import type { League } from '../core/api.types';
import { formatArtifactLine } from '../core/artifact-provenance';
import { AuthService } from '../core/auth.service';

type NavIcon =
  | 'dashboard'
  | 'strategy'
  | 'board'
  | 'draft'
  | 'auction'
  | 'roster'
  | 'research'
  | 'connect';

interface NavItem {
  label: string;
  icon: NavIcon;
  link: string | string[];
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const PAGE_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/$/, title: 'Dashboard' },
  { match: /^\/profile$/, title: 'Profile' },
  { match: /\/leagues\/connect$/, title: 'Connect leagues' },
  { match: /\/leagues\/manual-setup$/, title: 'Manual Setup' },
  { match: /\/strategy$/, title: 'Strategy Planner' },
  { match: /\/simulator$/, title: 'Strategy Simulator' },
  { match: /\/board(\/|$)/, title: 'Player Board' },
  { match: /\/draft$/, title: 'Live Draft Room' },
  { match: /\/auction$/, title: 'Auction Room' },
  { match: /\/roster$/, title: 'Roster & Dynasty' },
  { match: /\/recap$/, title: 'Recap' },
  { match: /\/calibration$/, title: 'Calibration' },
  { match: /\/scoring$/, title: 'Scoring settings' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgOptimizedImage],
  template: `
    <div class="shell dl-dark" [class.nav-open]="navOpen()">
      <button
        type="button"
        class="backdrop"
        aria-label="Close navigation"
        tabindex="-1"
        (click)="closeNav()"
      ></button>

      <aside
        id="app-sidebar"
        class="sidebar"
        [attr.aria-hidden]="isCompact() && !navOpen() ? 'true' : null"
      >
        <div class="brand">
          <img class="mark" src="/brand/logo-mark.png" width="40" height="40" alt="" aria-hidden="true" />
          <div class="name">DraftLab</div>
        </div>

        @if (active.leagues().length) {
          <label class="league-switcher">
            <span class="sw-label">ACTIVE LEAGUE</span>
            <span class="sw-name">
              {{ active.selected()?.name ?? 'Select league' }}
              <span class="chev" aria-hidden="true">▾</span>
            </span>
            @if (leagueMeta(); as meta) {
              <span class="sw-meta">{{ meta }}</span>
            }
            <select
              [value]="active.selectedId() ?? ''"
              (change)="onSelectLeague($event)"
              aria-label="Active league"
            >
              @for (league of active.leagues(); track league.id) {
                <option [value]="league.id">{{ league.name }}</option>
              }
            </select>
          </label>
        }

        <nav class="nav-scroll" aria-label="Primary">
          @for (group of navGroups(); track group.label) {
            <div class="nav-group">
              <div class="group-label">{{ group.label }}</div>
              @for (item of group.items; track item.label) {
                <a
                  class="nav-link"
                  [routerLink]="item.link"
                  routerLinkActive="active"
                  [routerLinkActiveOptions]="{ exact: item.exact === true }"
                  (click)="onNavClick()"
                >
                  <svg class="nav-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                    @switch (item.icon) {
                      @case ('dashboard') {
                        <path
                          d="M2.25 2.25H7.5V7.5H2.25V2.25ZM10.5 2.25H15.75V6H10.5V2.25ZM10.5 9H15.75V15.75H10.5V9ZM2.25 10.5H7.5V15.75H2.25V10.5Z"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      }
                      @case ('strategy') {
                        <path
                          d="M9 15.75C12.7279 15.75 15.75 12.7279 15.75 9C15.75 5.27208 12.7279 2.25 9 2.25C5.27208 2.25 2.25 5.27208 2.25 9C2.25 12.7279 5.27208 15.75 9 15.75Z"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <path
                          d="M9 12.75C11.0711 12.75 12.75 11.0711 12.75 9C12.75 6.92893 11.0711 5.25 9 5.25C6.92893 5.25 5.25 6.92893 5.25 9C5.25 11.0711 6.92893 12.75 9 12.75Z"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <path
                          d="M9 9.75C9.41421 9.75 9.75 9.41421 9.75 9C9.75 8.58579 9.41421 8.25 9 8.25C8.58579 8.25 8.25 8.58579 8.25 9C8.25 9.41421 8.58579 9.75 9 9.75Z"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      }
                      @case ('board') {
                        <path
                          d="M6 4.5H15.75M6 9H15.75M6 13.5H15.75M2.625 4.5H2.6325M2.625 9H2.6325M2.625 13.5H2.6325"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      }
                      @case ('draft') {
                        <path
                          d="M9 11.25C10.2426 11.25 11.25 10.2426 11.25 9C11.25 7.75736 10.2426 6.75 9 6.75C7.75736 6.75 6.75 7.75736 6.75 9C6.75 10.2426 7.75736 11.25 9 11.25Z"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <path
                          d="M4.725 4.725C4.15809 5.28329 3.70789 5.94877 3.40059 6.6827C3.09329 7.41662 2.93503 8.20434 2.93503 9C2.93503 9.79566 3.09329 10.5834 3.40059 11.3173C3.70789 12.0512 4.15809 12.7167 4.725 13.275M13.275 13.275C13.8419 12.7167 14.2921 12.0512 14.5994 11.3173C14.9067 10.5834 15.065 9.79566 15.065 9C15.065 8.20434 14.9067 7.41662 14.5994 6.6827C14.2921 5.94877 13.8419 5.28329 13.275 4.725"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      }
                      @case ('auction') {
                        <path
                          d="M9 15V6.75M13.5 15V3M4.5 15V10.5"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      }
                      @case ('roster') {
                        <path
                          d="M12 15V13.5C12 12.7044 11.6839 11.9413 11.1213 11.3787C10.5587 10.8161 9.79565 10.5 9 10.5H4.5C3.70435 10.5 2.94129 10.8161 2.37868 11.3787C1.81607 11.9413 1.5 12.7044 1.5 13.5V15"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <path
                          d="M6.75 7.875C8.19975 7.875 9.375 6.69975 9.375 5.25C9.375 3.80025 8.19975 2.625 6.75 2.625C5.30025 2.625 4.125 3.80025 4.125 5.25C4.125 6.69975 5.30025 7.875 6.75 7.875Z"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <path
                          d="M16.5 15V13.5C16.4995 12.8353 16.2783 12.1896 15.871 11.6642C15.4638 11.1389 14.8936 10.7637 14.25 10.5975"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      }
                      @case ('research') {
                        <path
                          d="M8.25 13.5C11.1495 13.5 13.5 11.1495 13.5 8.25C13.5 5.35051 11.1495 3 8.25 3C5.35051 3 3 5.35051 3 8.25C3 11.1495 5.35051 13.5 8.25 13.5Z"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <path
                          d="M15 15L11.625 11.625"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      }
                      @case ('connect') {
                        <path
                          d="M7.5 9.75C7.82449 10.1736 8.23566 10.5231 8.70602 10.7751C9.17639 11.0272 9.69513 11.1759 10.2276 11.2114C10.76 11.2469 11.2939 11.1683 11.7936 10.981C12.2932 10.7936 12.7471 10.5018 13.125 10.125L14.625 8.625C15.1666 7.90285 15.4296 7.00958 15.3656 6.10917C15.3016 5.20876 14.9149 4.36164 14.2767 3.72335C13.6384 3.08506 12.7912 2.69842 11.8908 2.63443C10.9904 2.57044 10.0971 2.83339 9.375 3.375L8.475 4.275M10.5 8.25C10.1755 7.82637 9.76434 7.47687 9.29398 7.22486C8.82361 6.97284 8.30487 6.82412 7.77243 6.78862C7.23998 6.75313 6.70609 6.83167 6.20643 7.01902C5.70677 7.20636 5.25285 7.49819 4.875 7.875L3.375 9.375C2.83339 10.0971 2.57044 10.9904 2.63443 11.8908C2.69842 12.7912 3.08506 13.6384 3.72335 14.2767C4.36164 14.9149 5.20876 15.3016 6.10917 15.3656C7.00958 15.4296 7.90285 15.1666 8.625 14.625L9.525 13.725"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      }
                    }
                  </svg>
                  {{ item.label }}
                </a>
              }
            </div>
          }
        </nav>

        <div class="side-foot">
          <div class="account-row">
            <a class="account" routerLink="/profile" (click)="onNavClick()">{{
              auth.user()?.displayName
            }}</a>
            <button type="button" class="logout" (click)="logout()">Log out</button>
          </div>
          <div class="sync-chip" role="status">
            <span class="dot" [class.idle]="!hasLiveSync()" aria-hidden="true"></span>
            <span>{{ syncLabel() }}</span>
          </div>
          @if (artifactLines().length) {
            <div class="artifact-chip" role="status" aria-label="Artifact data source">
              @for (line of artifactLines(); track line) {
                <div class="artifact-line">{{ line }}</div>
              }
            </div>
          }
        </div>
      </aside>

      <div class="main">
        <header class="top">
          <button
            type="button"
            class="menu-toggle"
            [attr.aria-expanded]="navOpen()"
            aria-controls="app-sidebar"
            [attr.aria-label]="navOpen() ? 'Close navigation' : 'Open navigation'"
            (click)="toggleNav()"
          >
            <span class="bars" aria-hidden="true"></span>
          </button>

          <div class="title-col">
            <h1 class="page-title">{{ pageTitle() }}</h1>
            <p class="page-sub">{{ pageSubtitle() }}</p>
          </div>

          <div class="top-spacer" aria-hidden="true"></div>

          <form class="search" role="search" (submit)="onSearch($event)">
            <img
              ngSrc="/nav/search.svg"
              width="16"
              height="16"
              alt=""
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              placeholder="Search players…"
              aria-label="Search players"
              [value]="searchQuery()"
              (input)="onSearchInput($event)"
            />
          </form>

          <div class="live-chip" role="status">
            <span class="dot" [class.idle]="!hasLiveSync()" aria-hidden="true"></span>
            {{ liveChipLabel() }}
          </div>

          <a
            class="avatar"
            routerLink="/profile"
            [attr.aria-label]="(auth.user()?.displayName ?? 'Account') + ' profile'"
            [style.--avatar-color]="avatarColor()"
          >
            {{ initials() }}
          </a>
        </header>

        <main class="content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styleUrl: './shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '(window:resize)': 'onResize()',
  },
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly active = inject(ActiveLeagueService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly navOpen = signal(false);
  readonly isCompact = signal(false);
  readonly searchQuery = signal('');
  readonly pageTitle = signal('Dashboard');
  readonly currentPath = signal('/');
  readonly artifactLines = signal<string[]>([]);

  readonly initials = computed(() => {
    const name = this.auth.user()?.displayName?.trim() || 'DL';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  });

  readonly avatarColor = computed(() => {
    switch (this.auth.user()?.initialsColor) {
      case 'pos-qb':
        return 'var(--dl-pos-qb)';
      case 'pos-rb':
        return 'var(--dl-pos-rb)';
      case 'pos-wr':
        return 'var(--dl-pos-wr)';
      case 'pos-te':
        return 'var(--dl-pos-te)';
      case 'accent-secondary':
        return 'var(--dl-accent-secondary)';
      default:
        return 'var(--dl-accent)';
    }
  });

  readonly leagueMeta = computed(() => {
    const league = this.active.selected();
    return league ? formatLeagueMeta(league) : null;
  });

  readonly hasLiveSync = computed(() => {
    const league = this.active.selected();
    return !!league && league.platform === 'sleeper';
  });

  readonly syncLabel = computed(() => {
    if (!this.active.leagues().length) return 'Connect a league to sync';
    if (this.hasLiveSync()) return 'Sleeper connected';
    return 'Manual league';
  });

  readonly liveChipLabel = computed(() => {
    const league = this.active.selected();
    if (!league) return 'No league';
    if (league.platform === 'sleeper') return 'Sleeper · live';
    return 'Manual · local';
  });

  readonly pageSubtitle = computed(() => {
    const path = this.currentPath();
    if (/^\/profile$/.test(path)) {
      const name = this.auth.user()?.displayName ?? 'Account';
      return `${name} · account settings apply to every league you connect`;
    }
    if (/\/leagues\/connect$/.test(path)) {
      return 'Import your real leagues so every projection is denominated in your own scoring';
    }
    if (/\/leagues\/manual-setup$/.test(path)) {
      return 'ESPN and any platform without an API · confirm scoring before you draft';
    }
    if (/\/scoring$/.test(path)) {
      const league = this.active.selected();
      if (!league) return 'Every projection on your board uses these rules';
      const source =
        league.platform === 'sleeper' ? 'imported from Sleeper' : 'manual league profile';
      return `${league.name} · ${source} · every projection on your board uses these rules`;
    }
    const count = this.active.leagues().length;
    if (!count) return 'Connect a league to get started';
    const selected = this.active.selected()?.name;
    return selected
      ? `${count} league${count === 1 ? '' : 's'} connected · ${selected}`
      : `${count} league${count === 1 ? '' : 's'} connected`;
  });

  readonly navGroups = computed((): NavGroup[] => {
    const id = this.active.selectedId();
    const leaguePath = (segment: string) => (id ? ['/leagues', id, segment] : ['/leagues/connect']);

    return [
      {
        label: 'PLAN',
        items: [
          { label: 'Dashboard', icon: 'dashboard', link: '/', exact: true },
          { label: 'Strategy Planner', icon: 'strategy', link: leaguePath('strategy') },
          { label: 'Strategy Simulator', icon: 'research', link: leaguePath('simulator') },
          { label: 'Player Board', icon: 'board', link: leaguePath('board') },
        ],
      },
      {
        label: 'DRAFT',
        items: [
          { label: 'Live Draft Room', icon: 'draft', link: leaguePath('draft') },
          { label: 'Auction Room', icon: 'auction', link: leaguePath('auction') },
        ],
      },
      {
        label: 'MANAGE',
        items: [
          { label: 'Roster & Dynasty', icon: 'roster', link: leaguePath('roster') },
          { label: 'Connections', icon: 'connect', link: '/leagues/connect' },
          { label: 'Manual Setup', icon: 'connect', link: '/leagues/manual-setup' },
          { label: 'Scoring', icon: 'auction', link: leaguePath('scoring') },
          { label: 'Recap', icon: 'board', link: leaguePath('recap') },
          { label: 'Calibration', icon: 'research', link: leaguePath('calibration') },
        ],
      },
    ];
  });

  ngOnInit() {
    this.syncCompact();
    this.destroyRef.onDestroy(() => {
      if (typeof document !== 'undefined') document.body.style.overflow = '';
    });
    this.api.leagues().subscribe((leagues) => this.active.setLeagues(leagues));
    this.api.health().subscribe({
      next: (health) => {
        const lines = [
          formatArtifactLine('Factors', health.artifacts?.factors),
          formatArtifactLine('Benchmarks', health.artifacts?.benchmarks),
        ].filter((line): line is string => line !== null);
        this.artifactLines.set(lines);
      },
      error: () => this.artifactLines.set([]),
    });
    this.updateTitle(this.router.url);

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.updateTitle(e.urlAfterRedirects);
        this.closeNav();
      });
  }

  onSelectLeague(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value) this.active.select(value);
  }

  toggleNav() {
    this.navOpen.update((open) => !open);
    this.syncBodyScroll();
  }

  closeNav() {
    if (!this.navOpen()) return;
    this.navOpen.set(false);
    this.syncBodyScroll();
  }

  onNavClick() {
    if (this.isCompact()) this.closeNav();
  }

  onEscape() {
    this.closeNav();
  }

  onResize() {
    this.syncCompact();
  }

  onSearchInput(event: Event) {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onSearch(event: Event) {
    event.preventDefault();
    const q = this.searchQuery().trim();
    const id = this.active.selectedId();
    if (!id) {
      void this.router.navigateByUrl('/leagues/connect');
      return;
    }
    void this.router.navigate(['/leagues', id, 'board'], q ? { queryParams: { q } } : {});
  }

  logout() {
    void this.auth.logout();
    this.active.clear();
  }

  private updateTitle(url: string) {
    const path = url.split('?')[0] ?? '/';
    this.currentPath.set(path);
    const hit = PAGE_TITLES.find((entry) => entry.match.test(path));
    this.pageTitle.set(hit?.title ?? 'DraftLab');
  }

  private syncCompact() {
    const compact = typeof window !== 'undefined' && window.innerWidth <= 1024;
    this.isCompact.set(compact);
    if (!compact && this.navOpen()) {
      this.navOpen.set(false);
      this.syncBodyScroll();
    }
  }

  private syncBodyScroll() {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = this.navOpen() ? 'hidden' : '';
  }
}

function formatLeagueMeta(league: League): string {
  const platform = league.platform === 'sleeper' ? 'Sleeper' : 'Manual';
  const teams = `${league.teamCount}-team`;
  const type = titleCase(league.type || league.draftType || 'League');
  const scoring = league.scoringSummary?.variant?.toUpperCase() || 'PPR';
  return `${platform} · ${teams} · ${type} · ${scoring}`;
}

function titleCase(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

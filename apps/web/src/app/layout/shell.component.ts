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
import { AuthService } from '../core/auth.service';

interface NavItem {
  label: string;
  icon: string;
  link: string | string[];
  exact?: boolean;
  requiresLeague?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const PAGE_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/$/, title: 'Dashboard' },
  { match: /\/leagues\/connect$/, title: 'Connections' },
  { match: /\/leagues\/manual-setup$/, title: 'Manual Setup' },
  { match: /\/strategy$/, title: 'Strategy Planner' },
  { match: /\/cheat-sheet$/, title: 'Cheat Sheet' },
  { match: /\/board(\/|$)/, title: 'Player Board' },
  { match: /\/draft$/, title: 'Live Draft Room' },
  { match: /\/auction$/, title: 'Auction Room' },
  { match: /\/roster$/, title: 'Roster & Dynasty' },
  { match: /\/recap$/, title: 'Recap' },
  { match: /\/calibration$/, title: 'Calibration' },
  { match: /\/scoring$/, title: 'Scoring' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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
          <span class="mark" aria-hidden="true">D</span>
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
                  <span
                    class="nav-icon"
                    aria-hidden="true"
                    [style.--icon]="'url(/nav/' + item.icon + '.svg)'"
                  ></span>
                  {{ item.label }}
                </a>
              }
            </div>
          }
        </nav>

        <div class="side-foot">
          <div class="account-row">
            <div class="account">{{ auth.user()?.displayName }}</div>
            <button type="button" class="logout" (click)="logout()">Log out</button>
          </div>
          <div class="sync-chip" role="status">
            <span class="dot" [class.idle]="!hasLiveSync()" aria-hidden="true"></span>
            <span>{{ syncLabel() }}</span>
          </div>
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
            <img src="/nav/search.svg" width="16" height="16" alt="" />
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

          <div class="avatar" [attr.aria-label]="auth.user()?.displayName ?? 'Account'">
            {{ initials() }}
          </div>
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

  readonly initials = computed(() => {
    const name = this.auth.user()?.displayName?.trim() || 'DL';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
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
          {
            label: 'Strategy Planner',
            icon: 'strategy',
            link: leaguePath('strategy'),
            requiresLeague: true,
          },
          {
            label: 'Player Board',
            icon: 'board',
            link: leaguePath('board'),
            requiresLeague: true,
          },
          {
            label: 'Cheat Sheet',
            icon: 'research',
            link: leaguePath('cheat-sheet'),
            requiresLeague: true,
          },
        ],
      },
      {
        label: 'DRAFT',
        items: [
          {
            label: 'Live Draft Room',
            icon: 'draft',
            link: leaguePath('draft'),
            requiresLeague: true,
          },
          {
            label: 'Auction Room',
            icon: 'auction',
            link: leaguePath('auction'),
            requiresLeague: true,
          },
        ],
      },
      {
        label: 'MANAGE',
        items: [
          {
            label: 'Roster & Dynasty',
            icon: 'roster',
            link: leaguePath('roster'),
            requiresLeague: true,
          },
          { label: 'Connections', icon: 'connect', link: '/leagues/connect' },
          { label: 'Manual Setup', icon: 'connect', link: '/leagues/manual-setup' },
          {
            label: 'Scoring',
            icon: 'auction',
            link: leaguePath('scoring'),
            requiresLeague: true,
          },
          {
            label: 'Recap',
            icon: 'board',
            link: leaguePath('recap'),
            requiresLeague: true,
          },
          {
            label: 'Calibration',
            icon: 'research',
            link: leaguePath('calibration'),
            requiresLeague: true,
          },
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
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

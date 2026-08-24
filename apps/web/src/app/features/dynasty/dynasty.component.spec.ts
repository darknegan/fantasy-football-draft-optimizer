import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import type { DynastyBoardRow, DynastyOverview, League, Position } from '../../core/api.types';
import { DynastyComponent } from './dynasty.component';

function makeRow(
  playerId: string,
  name: string,
  position: Position,
  extras: Partial<DynastyBoardRow> = {},
): DynastyBoardRow {
  return {
    playerId,
    name,
    position,
    age: 25,
    seasonsInLeague: 3,
    archetype: 'ELITE',
    draftScore: 80,
    npv: 100,
    dynastyScore: 90,
    trend: 'hold',
    curve: { points: [{ yearOffset: 0, season: 2026, value: 80 }], npv: 100 },
    ...extras,
  };
}

function makeLeague(overrides: Partial<League> = {}): League {
  return {
    id: 'league-1',
    userId: 'user-1',
    name: 'Demo League',
    platform: 'manual',
    type: 'dynasty',
    draftType: 'snake',
    teamCount: 12,
    season: 2026,
    ...overrides,
  };
}

function makeOverview(overrides: Partial<DynastyOverview> = {}): DynastyOverview {
  const youQb = makeRow('josh-allen', 'Josh Allen', 'QB', { amount: 52 });
  const youRb = makeRow('bijan-robinson', 'Bijan Robinson', 'RB', { amount: 61 });
  const rivalWr = makeRow('jamarr-chase', "Ja'Marr Chase", 'WR', { amount: 70 });
  return {
    leagueId: 'league-1',
    mode: 'rebuild',
    isAuction: false,
    userRosterId: 'roster-user',
    ageCurve: {
      meanAge: 26,
      medianAge: 26,
      buckets: [],
      contendScore: 0.5,
      rebuildScore: 0.5,
    },
    pickAssets: [],
    ownedPickValue: 0,
    board: [youQb, youRb, rivalWr],
    rosterBoard: [youQb, youRb],
    teamRosters: [
      {
        rosterId: 'roster-user',
        name: 'You',
        isUser: true,
        players: [youQb, youRb],
      },
      {
        rosterId: 'roster-2',
        name: 'Team 2',
        isUser: false,
        players: [rivalWr],
      },
      ...Array.from({ length: 10 }, (_, i) => ({
        rosterId: `roster-${i + 3}`,
        name: `Team ${i + 3}`,
        isUser: false,
        players: [] as DynastyBoardRow[],
      })),
    ],
    rookieBoard: [],
    summary: {
      rosterCount: 2,
      meanAge: 26,
      agingRisk: 0,
      contendWindow: { startSeason: 2026, endSeason: 2028, seasons: 3 },
      horizon: { startSeason: 2027, endSeason: 2030 },
      pickCount: 0,
      firsts: 0,
      seconds: 0,
    },
    ...overrides,
  };
}

async function createDynasty(
  overview: DynastyOverview,
  league: League = makeLeague(),
  extras: {
    paramId?: string;
    params?: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
    leagueFn?: ReturnType<typeof vi.fn>;
    dynastyFn?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const paramId = extras.paramId ?? 'league-1';
  const params = extras.params ?? new BehaviorSubject(convertToParamMap({ id: paramId }));
  const leagueFn = extras.leagueFn ?? vi.fn(() => of(league));
  const dynastyFn = extras.dynastyFn ?? vi.fn(() => of(overview));
  await TestBed.configureTestingModule({
    imports: [DynastyComponent],
    providers: [
      provideRouter([]),
      {
        provide: ApiService,
        useValue: {
          league: leagueFn,
          dynasty: dynastyFn,
          setDynastyMode: () => of(overview),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ id: paramId }) },
          paramMap: params.asObservable(),
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(DynastyComponent);
  fixture.detectChanges();
  return { fixture, params, leagueFn, dynastyFn };
}

describe('DynastyComponent league rosters', () => {
  it('renders a card for every team with players listed by position', async () => {
    const { fixture } = await createDynasty(makeOverview());
    const root = fixture.nativeElement as HTMLElement;
    const cards = root.querySelectorAll('.team-card');
    expect(cards.length).toBe(12);
    expect(root.textContent).toContain('You');
    expect(root.textContent).toContain('Team 2');
    expect(root.textContent).toContain('Team 12');
    expect(root.textContent).toContain('Josh Allen');
    expect(root.textContent).toContain('Bijan Robinson');
    expect(root.textContent).toContain("Ja'Marr Chase");
    expect(root.querySelectorAll('.pos-group').length).toBe(12 * 4);
    expect(root.textContent).not.toContain('$52');
  });

  it('keeps every team blank when the roster board is empty', async () => {
    const emptyTeams = Array.from({ length: 12 }, (_, i) => ({
      rosterId: i === 0 ? 'roster-user' : `roster-${i + 1}`,
      name: i === 0 ? 'You' : `Team ${i + 1}`,
      isUser: i === 0,
      spent: 0,
      remaining: 200,
      players: [] as DynastyBoardRow[],
    }));
    const { fixture } = await createDynasty(
      makeOverview({
        isAuction: true,
        rosterBoard: [],
        teamRosters: emptyTeams,
        summary: {
          rosterCount: 0,
          meanAge: 0,
          agingRisk: 0,
          contendWindow: { startSeason: 2026, endSeason: 2028, seasons: 3 },
          horizon: { startSeason: 2027, endSeason: 2030 },
          pickCount: 0,
          firsts: 0,
          seconds: 0,
        },
      }),
      makeLeague({ type: 'auction', draftType: 'auction', auctionBudget: 200 }),
    );
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('0 players');
    expect(root.textContent).not.toContain('Josh Allen');
    expect(root.textContent).not.toContain('Bijan Robinson');
    expect(root.querySelector('.curves-table tbody .empty')).toBeTruthy();
  });

  it('shows winning bid amounts in auction leagues', async () => {
    const overview = makeOverview({ isAuction: true });
    overview.teamRosters = (overview.teamRosters ?? []).map((team) =>
      team.isUser
        ? { ...team, spent: 113, remaining: 87 }
        : team.rosterId === 'roster-2'
          ? { ...team, spent: 70, remaining: 130 }
          : { ...team, spent: 0, remaining: 200 },
    );
    const { fixture } = await createDynasty(
      overview,
      makeLeague({ type: 'auction', draftType: 'auction', auctionBudget: 200 }),
    );
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('winning bid shown in dollars');
    expect(root.textContent).toContain('$52');
    expect(root.textContent).toContain('$61');
    expect(root.textContent).toContain('$70');
    expect(root.textContent).toContain('$113');
    expect(root.textContent).toContain('$87 left');
  });

  it('reloads when the league id in the route changes', async () => {
    const params = new BehaviorSubject(convertToParamMap({ id: 'league-1' }));
    const otherOverview = makeOverview({
      leagueId: 'league-2',
      rosterBoard: [makeRow('saquon-barkley', 'Saquon Barkley', 'RB')],
      teamRosters: [
        {
          rosterId: 'roster-user',
          name: 'Other You',
          isUser: true,
          players: [makeRow('saquon-barkley', 'Saquon Barkley', 'RB')],
        },
      ],
    });
    const leagueFn = vi.fn((id: string) =>
      of(id === 'league-2' ? makeLeague({ id: 'league-2', name: 'Other League' }) : makeLeague()),
    );
    const dynastyFn = vi.fn((id: string) => of(id === 'league-2' ? otherOverview : makeOverview()));
    const { fixture } = await createDynasty(makeOverview(), makeLeague(), {
      params,
      leagueFn,
      dynastyFn,
    });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Josh Allen');
    params.next(convertToParamMap({ id: 'league-2' }));
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Saquon Barkley');
    expect(text).toContain('Other You');
    expect(text).not.toContain('Josh Allen');
    expect(dynastyFn).toHaveBeenCalledWith('league-2');
  });
});

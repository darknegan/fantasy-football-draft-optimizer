import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ApiService } from '../../core/api.service';
import type {
  BoardPlayer,
  DraftState,
  League,
  Player,
  PlayerEvaluation,
  Position,
} from '../../core/api.types';
import { BoardComponent } from './board.component';

/**
 * Component-level render tests. These exist specifically to close the gap the
 * final branch review flagged: everything about `board.component.ts`'s
 * survival-band fallback, chip independence from filtering, and axis-bound
 * cliff markers had only ever been verified by reading source and tracing
 * branches by hand — `apps/api` requires a live `DATABASE_URL` with no
 * fallback, so nothing had ever actually rendered. TestBed + jsdom sidesteps
 * that entirely: `ApiService` is replaced with a stub below, so no HTTP call
 * (and no database) is ever involved.
 */

function makePlayer(id: string, position: Position, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    team: 'BUF',
    position,
    age: 25,
    seasonsInLeague: 3,
    status: 'active',
    ...overrides,
  };
}

function makeEvaluation(
  draftScore: number,
  overrides: Partial<PlayerEvaluation> = {},
): PlayerEvaluation {
  return {
    playerId: 'x',
    ceiling: {
      ceilingScore: 40,
      factors: [],
      knownFactors: 5,
      confidenceScore: 0.8,
      provisional: false,
    },
    archetype: { archetype: 'trusty_starter', archetypeEv: 0.2 },
    risk: { riskProfile: 30, expectedGamesMissed: 1 },
    value: { valueScore: 0, adpRoundPick: '1.01', blendedRank: 10 },
    draftScore,
    ...overrides,
  };
}

function makeRow(
  id: string,
  position: Position,
  draftScore: number,
  overrides: Partial<BoardPlayer> & { evaluationOverrides?: Partial<PlayerEvaluation> } = {},
): BoardPlayer {
  const { evaluationOverrides, ...rest } = overrides;
  return {
    player: makePlayer(id, position),
    evaluation: makeEvaluation(draftScore, evaluationOverrides),
    drafted: false,
    ...rest,
  };
}

const ROSTER = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0, bench: 6, totalStarters: 7 };

function makeLeague(overrides: Partial<League> = {}): League {
  return {
    id: 'league-1',
    userId: 'user-1',
    name: 'Test League',
    platform: 'manual',
    type: 'redraft',
    draftType: 'snake',
    teamCount: 12,
    season: 2026,
    draftSlot: 1,
    roster: ROSTER,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<DraftState> = {}): DraftState {
  return {
    leagueId: 'league-1',
    draftId: 'draft-1',
    status: 'pre_draft',
    currentPick: 1,
    picks: [],
    userRosterId: 'user-roster',
    lastSyncedAt: null,
    syncMode: 'manual',
    picksUntilUser: 0,
    ...overrides,
  };
}

/** Stubs ApiService so ngOnInit's forkJoin resolves with no HTTP call, then
 * overwrites the component's own signals directly for the scenario under test. */
async function createBoard(
  rows: BoardPlayer[],
  league: League | null,
  draft: DraftState | null = makeDraft(),
): Promise<ReturnType<typeof TestBed.createComponent<BoardComponent>>> {
  await TestBed.configureTestingModule({
    imports: [BoardComponent],
    providers: [
      provideRouter([]),
      {
        provide: ApiService,
        useValue: {
          board: () => of([]),
          league: () => of(makeLeague()),
          draft: () => of(makeDraft()),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'league-1' }) } },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(BoardComponent);
  fixture.detectChanges(); // runs ngOnInit against the stub

  fixture.componentInstance.rows.set(rows);
  fixture.componentInstance.league.set(league);
  fixture.componentInstance.draft.set(draft);
  fixture.detectChanges();
  return fixture;
}

describe('BoardComponent', () => {
  it('never shows "no players match filters" while rows exist, even before the league loads', async () => {
    const rows = [makeRow('a', 'RB', 70), makeRow('b', 'WR', 60)];
    const fixture = await createBoard(rows, null, null);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.empty')).toBeNull();
    expect(el.querySelectorAll('.row')).toHaveLength(2);
    expect(el.querySelector('.tier-break')).toBeNull();
  });

  it('renders one flat list ordered by ceiling then proj, ignoring survival bands', async () => {
    const earlyLow = makeRow('early-low', 'RB', 90, {
      projectedPoints: 200,
      evaluationOverrides: {
        ceiling: {
          ceilingScore: 10,
          factors: [],
          knownFactors: 5,
          confidenceScore: 0.8,
          provisional: false,
        },
        value: { valueScore: 0, adpRoundPick: '1.01', blendedRank: 1 },
      },
    });
    const lateHigh = makeRow('late-high', 'WR', 60, {
      projectedPoints: 380,
      evaluationOverrides: {
        ceiling: {
          ceilingScore: 40,
          factors: [],
          knownFactors: 5,
          confidenceScore: 0.8,
          provisional: false,
        },
        value: { valueScore: 0, adpRoundPick: '9.05', blendedRank: 90 },
      },
    });
    const fixture = await createBoard(
      [earlyLow, lateHigh],
      makeLeague({ draftSlot: 1 }),
      makeDraft({ currentPick: 13, picksUntilUser: 11 }),
    );
    const el: HTMLElement = fixture.nativeElement;
    const names = [...el.querySelectorAll('.row .name')].map((n) => n.textContent?.trim());

    expect(el.querySelector('.tier-break')).toBeNull();
    expect(names).toEqual(['late-high', 'early-low']);
  });

  it('breaks ceiling ties using projected points, highest first', async () => {
    const lowProj = makeRow('low-proj', 'RB', 70, {
      projectedPoints: 376.3,
      evaluationOverrides: {
        ceiling: {
          ceilingScore: 20,
          factors: [],
          knownFactors: 5,
          confidenceScore: 0.8,
          provisional: false,
        },
      },
    });
    const highProj = makeRow('high-proj', 'WR', 70, {
      projectedPoints: 386.1,
      evaluationOverrides: {
        ceiling: {
          ceilingScore: 20,
          factors: [],
          knownFactors: 5,
          confidenceScore: 0.8,
          provisional: false,
        },
      },
    });
    const fixture = await createBoard([lowProj, highProj], null, null);

    expect(fixture.componentInstance.filteredSorted().map((r) => r.player.id)).toEqual([
      'high-proj',
      'low-proj',
    ]);
  });

  it('renders quality and replacement chips independent of which position is filtered', async () => {
    const graded = makeRow('graded', 'RB', 75);
    const noData = makeRow('nodata', 'WR', 999, {
      evaluationOverrides: {
        ceiling: {
          ceilingScore: null,
          factors: [],
          knownFactors: 0,
          confidenceScore: 0,
          provisional: false,
        },
      },
    });
    const fixture = await createBoard([graded, noData], makeLeague());
    const component = fixture.componentInstance;

    expect(component.bandOf(graded)).toBe('S');
    expect(component.bandOf(noData)).toBeNull();
    expect(component.replacementOf(graded)).toBe('RB1');

    const gradedRankBefore = component.replacementOf(graded);
    const bandBefore = component.bandOf(graded);

    component.posFilter.set('WR');
    fixture.detectChanges();

    expect(component.replacementOf(graded)).toBe(gradedRankBefore);
    expect(component.bandOf(graded)).toBe(bandBefore);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.band-none')).not.toBeNull();
    expect(el.querySelector('.band-S')).toBeNull();
  });

  it('defaults to ceiling sort so the factor composite, not draft score, orders rows', async () => {
    const highDraftLowCeil = makeRow('high-draft', 'RB', 95, {
      evaluationOverrides: {
        ceiling: {
          ceilingScore: 12,
          factors: [],
          knownFactors: 5,
          confidenceScore: 0.8,
          provisional: false,
        },
      },
    });
    const lowDraftHighCeil = makeRow('high-ceil', 'WR', 70, {
      evaluationOverrides: {
        ceiling: {
          ceilingScore: 40,
          factors: [],
          knownFactors: 5,
          confidenceScore: 0.8,
          provisional: false,
        },
      },
    });
    const fixture = await createBoard([highDraftLowCeil, lowDraftHighCeil], null, null);
    const component = fixture.componentInstance;

    expect(component.sortKey()).toBe('ceiling');
    expect(component.filteredSorted().map((r) => r.player.id)).toEqual([
      'high-ceil',
      'high-draft',
    ]);

    component.sortKey.set('draft');
    fixture.detectChanges();
    expect(component.filteredSorted().map((r) => r.player.id)).toEqual([
      'high-draft',
      'high-ceil',
    ]);
  });

  it('shows cliff markers only under a score-based sort', async () => {
    const rows = [
      makeRow('p1', 'RB', 90, {
        evaluationOverrides: {
          ceiling: {
            ceilingScore: 50,
            factors: [],
            knownFactors: 5,
            confidenceScore: 0.8,
            provisional: false,
          },
        },
      }),
      makeRow('p2', 'RB', 85, {
        evaluationOverrides: {
          ceiling: {
            ceilingScore: 48,
            factors: [],
            knownFactors: 5,
            confidenceScore: 0.8,
            provisional: false,
          },
        },
      }),
      makeRow('p3', 'RB', 25, {
        evaluationOverrides: {
          ceiling: {
            ceilingScore: 10,
            factors: [],
            knownFactors: 5,
            confidenceScore: 0.8,
            provisional: false,
          },
        },
      }),
      makeRow('p4', 'RB', 20, {
        evaluationOverrides: {
          ceiling: {
            ceilingScore: 8,
            factors: [],
            knownFactors: 5,
            confidenceScore: 0.8,
            provisional: false,
          },
        },
      }),
    ];
    const fixture = await createBoard(rows, makeLeague());
    const component = fixture.componentInstance;
    const el: HTMLElement = fixture.nativeElement;

    expect(component.sortKey()).toBe('ceiling');
    expect(component.cliffAfterIds().size).toBeGreaterThan(0);
    expect(el.querySelectorAll('.cliff-marker').length).toBeGreaterThan(0);

    component.sortKey.set('adp');
    fixture.detectChanges();

    expect(component.cliffAfterIds().size).toBe(0);
    expect(el.querySelectorAll('.cliff-marker')).toHaveLength(0);

    component.sortKey.set('draft');
    fixture.detectChanges();
    expect(component.cliffAfterIds().size).toBeGreaterThan(0);
  });

  it('suppresses cliff markers when drafted rows sit between measured neighbors', async () => {
    const rows = [
      makeRow('p1', 'RB', 90),
      makeRow('p2', 'RB', 85, { drafted: true }),
      makeRow('p3', 'RB', 25),
      makeRow('p4', 'RB', 20),
    ];
    const fixture = await createBoard(rows, makeLeague());
    fixture.componentInstance.hideDrafted.set(false);
    fixture.detectChanges();

    expect(fixture.componentInstance.cliffAfterIds().size).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.cliff-marker')).toHaveLength(0);
  });
});

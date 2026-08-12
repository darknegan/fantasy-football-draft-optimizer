import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ApiService } from '../../core/api.service';
import type { BoardPlayer, League, Player, PlayerEvaluation, Position } from '../../core/api.types';
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

/** Stubs ApiService so ngOnInit's forkJoin resolves with no HTTP call, then
 * overwrites the component's own signals directly for the scenario under test. */
async function createBoard(
  rows: BoardPlayer[],
  league: League | null,
): Promise<ReturnType<typeof TestBed.createComponent<BoardComponent>>> {
  TestBed.configureTestingModule({
    imports: [BoardComponent],
    providers: [
      provideRouter([]),
      {
        provide: ApiService,
        useValue: {
          board: () => of([]),
          league: () => of(makeLeague()),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'league-1' }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(BoardComponent);
  fixture.detectChanges(); // runs ngOnInit against the stub

  // Overwrite with the exact fixture for this test. rows/league are public
  // signals for this reason — no need to route through the stub's Observables.
  fixture.componentInstance.rows.set(rows);
  fixture.componentInstance.league.set(league);
  fixture.detectChanges();
  return fixture;
}

describe('BoardComponent', () => {
  it('never shows "no players match filters" while rows exist, even before the league loads', async () => {
    // league stays null here — nextUserPick(null, ...) returns null immediately.
    // This is the exact branch Finding 1 fixed: `sections` used to return []
    // whenever nextUserPick returned null for ANY reason, which the template
    // rendered as a false "no players match these filters" message.
    const rows = [makeRow('a', 'RB', 70), makeRow('b', 'WR', 60)];
    const fixture = await createBoard(rows, null);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.empty')).toBeNull();
    expect(fixture.componentInstance.sections()).toHaveLength(1);
    expect(fixture.componentInstance.sections()[0]!.id).toBe('unbanded');
    expect(el.querySelectorAll('.row')).toHaveLength(2);
    expect(el.querySelector('.tier-tag')?.textContent).toContain('All remaining players');
  });

  it('defaults a missing draftSlot to a real survival partition instead of blanking the board', () => {
    // This is Finding 1's other branch: draftSlot unset used to be the ONLY
    // place in the app that didn't default to 1, which returned null and blanked
    // the board. It should now compute real survival bands, same as any other
    // league.
    const league = makeLeague({ draftSlot: undefined });
    const rows = [
      makeRow('a', 'RB', 70, {
        evaluationOverrides: { value: { valueScore: 0, adpRoundPick: '1.01', blendedRank: 1 } },
      }),
      makeRow('b', 'WR', 60, {
        evaluationOverrides: { value: { valueScore: 0, adpRoundPick: '9.05', blendedRank: 90 } },
      }),
    ];
    return createBoard(rows, league).then((fixture) => {
      const el: HTMLElement = fixture.nativeElement;
      const sections = fixture.componentInstance.sections();

      expect(el.querySelector('.empty')).toBeNull();
      expect(sections.length).toBeGreaterThan(0);
      // A real survival partition, not the "couldn't compute anything" fallback.
      expect(sections.some((s) => s.id === 'unbanded')).toBe(false);
      expect(el.querySelectorAll('.row')).toHaveLength(2);
    });
  });

  it('renders quality and replacement chips independent of which position is filtered', async () => {
    // draftScore 75 -> 'S' under the tuned thresholds (S >= 70); knownFactors
    // 0 -> no letter at all, rendered as the dash chip instead.
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

    // Filtering to WR removes 'graded' (an RB) from the rendered rows, but its
    // chip values must not have changed — replacement rank and quality band are
    // computed from the FULL board (`rows()`), never the filtered view. That
    // independence is the entire point of this redesign; a regression here
    // would silently reintroduce the bug the branch exists to fix.
    component.posFilter.set('WR');
    fixture.detectChanges();

    expect(component.replacementOf(graded)).toBe(gradedRankBefore);
    expect(component.bandOf(graded)).toBe(bandBefore);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.band-none')).not.toBeNull();
    expect(el.querySelector('.band-S')).toBeNull(); // graded's row is filtered out of the DOM now
  });

  it('shows cliff markers only under a score-based sort', async () => {
    // Gaps (sorted desc by draftScore): 90->85 (5), 85->25 (60), 25->20 (5).
    // Median gap = 5, k = 5 (the tuned default) => threshold 25. Only the
    // 85->25 gap clears it, so exactly one cliff is expected under 'draft' sort.
    const rows = [
      makeRow('p1', 'RB', 90),
      makeRow('p2', 'RB', 85),
      makeRow('p3', 'RB', 25),
      makeRow('p4', 'RB', 20),
    ];
    const fixture = await createBoard(rows, makeLeague());
    const component = fixture.componentInstance;
    const el: HTMLElement = fixture.nativeElement;

    expect(component.sortKey()).toBe('draft'); // default
    expect(component.cliffAfterIds().size).toBeGreaterThan(0);
    expect(el.querySelectorAll('.cliff-marker').length).toBeGreaterThan(0);

    component.sortKey.set('adp');
    fixture.detectChanges();

    expect(component.cliffAfterIds().size).toBe(0);
    expect(el.querySelectorAll('.cliff-marker')).toHaveLength(0);
  });
});

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../core/api.service';
import type { AuctionState, League } from '../../core/api.types';
import { AuctionComponent } from './auction.component';

const you = {
  rosterId: 'roster-user',
  name: 'You',
  startingBudget: 200,
  spent: 0,
  remaining: 200,
  rosterSlotsFilled: 0,
  rosterSlotsTotal: 13,
};

const rival = {
  rosterId: 'roster-2',
  name: 'Team 2',
  startingBudget: 200,
  spent: 0,
  remaining: 200,
  rosterSlotsFilled: 0,
  rosterSlotsTotal: 13,
};

const hall = {
  playerId: 'breece-hall',
  name: 'Breece Hall',
  position: 'RB' as const,
  age: 24,
  draftScore: 80,
  fairValue: 42,
  inflatedValue: 42,
  vorpShare: 0.1,
  vor: 12.4,
  ceilingValue: 50,
};

function makeLeague(): League {
  return {
    id: 'league-1',
    userId: 'user-1',
    name: 'Demo Auction',
    platform: 'manual',
    type: 'auction',
    draftType: 'auction',
    teamCount: 12,
    season: 2026,
    strategyId: 'hero_rb',
    roster: { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, superflex: 0, bench: 6, totalStarters: 7 },
    auctionBudget: 200,
  };
}

function makeState(overrides: Partial<AuctionState> = {}): AuctionState {
  return {
    leagueId: 'league-1',
    inflationRate: 0,
    budgets: [you, rival],
    bids: [],
    contractRules: {
      maxLength: 4,
      salaryCap: null,
      deadCapPctOnRelease: 0.5,
      allowExtensions: false,
      franchiseTag: false,
      rolloverUnusedCap: false,
    },
    values: [hall],
    nominations: [],
    userBudget: you,
    signedRoster: [],
    teamRosters: [
      { rosterId: you.rosterId, name: you.name, players: [] },
      { rosterId: rival.rosterId, name: rival.name, players: [] },
    ],
    cap: 200,
    valueBoard: { id: '1qb-full-ppr', label: '1QB Full PPR' },
    ...overrides,
  };
}

async function createAuction(
  state: AuctionState,
  extras: {
    bid?: ReturnType<typeof vi.fn>;
    renameAuctionTeam?: ReturnType<typeof vi.fn>;
    releaseAuctionContract?: ReturnType<typeof vi.fn>;
    claimAuctionTeam?: ReturnType<typeof vi.fn>;
    league?: League;
  } = {},
) {
  const bid = extras.bid ?? vi.fn(() => of(state));
  const renameAuctionTeam =
    extras.renameAuctionTeam ??
    vi.fn((_: string, rosterId: string, name: string) =>
      of({
        ...state,
        budgets: state.budgets.map((b) => (b.rosterId === rosterId ? { ...b, name } : b)),
        userBudget:
          state.userBudget.rosterId === rosterId ? { ...state.userBudget, name } : state.userBudget,
        teamRosters: (state.teamRosters ?? []).map((t) =>
          t.rosterId === rosterId ? { ...t, name } : t,
        ),
      }),
    );
  const releaseAuctionContract = extras.releaseAuctionContract ?? vi.fn(() => of(state));
  const claimAuctionTeam = extras.claimAuctionTeam ?? vi.fn(() => of(state));
  await TestBed.configureTestingModule({
    imports: [AuctionComponent],
    providers: [
      provideRouter([]),
      {
        provide: ApiService,
        useValue: {
          league: () => of(extras.league ?? makeLeague()),
          auctionState: () => of(state),
          auctionBid: bid,
          renameAuctionTeam,
          releaseAuctionContract,
          claimAuctionTeam,
          auctionMaxBid: () =>
            of({
              playerId: hall.playerId,
              maxBid: 50,
              remainingBudget: 200,
              slotsLeft: 13,
              reserveForRest: 0,
            }),
          auctionContractPreview: () => of(null),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'league-1' }) } },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AuctionComponent);
  fixture.detectChanges();
  return { fixture, bid, renameAuctionTeam, releaseAuctionContract, claimAuctionTeam };
}

describe('AuctionComponent on-the-block', () => {
  it('does not show VOR on the auction screen', async () => {
    const { fixture } = await createAuction(makeState());
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toMatch(/\bVOR\b/);
    expect(fixture.nativeElement.querySelector('.c-score')).toBeNull();
  });

  it('keeps name, min, max, our value, and inflation on the block', async () => {
    const { fixture } = await createAuction(makeState());
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Breece Hall');
    expect(el.textContent).toContain('MIN');
    expect(el.textContent).toContain('MAX');
    expect(el.textContent).toContain('OUR VALUE');
    expect(el.textContent).toContain('WITH INFLATION');
    expect(el.textContent).toContain('$1');
    expect(el.textContent).toContain('$50');
    expect(el.textContent).toContain('$42');
  });

  it('recommends from strategy, price, and current roster', async () => {
    const { fixture } = await createAuction(makeState());
    const advice = fixture.nativeElement.querySelector('.lot-advice') as HTMLElement | null;
    expect(advice).toBeTruthy();
    expect(advice!.textContent).toMatch(/Take/i);
    expect(advice!.textContent).toMatch(/Hero RB/i);
  });

  it('passes when leftover budget cannot cover the nominated price', async () => {
    const brokeYou = { ...you, remaining: 10, spent: 190, rosterSlotsFilled: 5 };
    const { fixture } = await createAuction(
      makeState({
        values: [{ ...hall, position: 'WR', name: 'Puka Nacua', playerId: 'puka-nacua', fairValue: 50, inflatedValue: 49, ceilingValue: 56 }],
        userBudget: brokeYou,
        budgets: [brokeYou, rival],
        signedRoster: [
          { playerId: 'rb1', name: 'RB1', position: 'RB', amount: 40, contractYears: 1, team: 'BUF' },
          { playerId: 'rb2', name: 'RB2', position: 'RB', amount: 30, contractYears: 1, team: 'KC' },
        ],
      }),
    );
    const advice = fixture.nativeElement.querySelector('.lot-advice') as HTMLElement | null;
    expect(advice?.textContent).toMatch(/Pass/i);
    expect(advice?.textContent).toMatch(/\$10/);
    const amount = fixture.nativeElement.querySelector('.winner-form input') as HTMLInputElement;
    expect(Number(amount.value)).toBeLessThanOrEqual(10);
  });

  it('records the winning team and price, then removes the player from the board', async () => {
    const after = makeState({
      values: [],
      bids: [{ playerId: hall.playerId, rosterId: rival.rosterId, amount: 33 }],
      budgets: [you, { ...rival, spent: 33, remaining: 167, rosterSlotsFilled: 1 }],
      teamRosters: [
        { rosterId: you.rosterId, name: you.name, players: [] },
        {
          rosterId: rival.rosterId,
          name: rival.name,
          players: [
            {
              playerId: hall.playerId,
              name: hall.name,
              position: hall.position,
              amount: 33,
              contractYears: 1,
              team: 'NYJ',
            },
          ],
        },
      ],
    });
    const bid = vi.fn(() => of(after));
    const { fixture } = await createAuction(makeState(), { bid });
    const root: HTMLElement = fixture.nativeElement;

    const select = root.querySelector('.winner-form select') as HTMLSelectElement;
    select.value = rival.rosterId;
    select.dispatchEvent(new Event('change'));
    const input = root.querySelector('.winner-form input') as HTMLInputElement;
    input.value = '33';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (root.querySelector('.winner-form button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(bid).toHaveBeenCalledWith('league-1', {
      playerId: 'breece-hall',
      amount: 33,
      rosterId: 'roster-2',
      contractYears: 4,
    });
    expect(root.querySelector('.avail-list')).toBeNull();
    const signed = Array.from(root.querySelectorAll('.team-room')).find(
      (node) => (node.querySelector('.team-name-input') as HTMLInputElement | null)?.value === 'Team 2',
    );
    expect(signed?.textContent).toContain('Breece Hall');
    expect(signed?.textContent).toContain('$33');
  });

  it('recommends mid-tier next players after two expensive signings', async () => {
    const brokeYou = { ...you, remaining: 110, spent: 90, rosterSlotsFilled: 2 };
    const values = [
      { playerId: 'cmc', name: 'Christian McCaffrey', position: 'RB' as const, age: 28, draftScore: 99, fairValue: 58, inflatedValue: 58, vorpShare: 0.2 },
      { playerId: 'chase', name: "Ja'Marr Chase", position: 'WR' as const, age: 25, draftScore: 97, fairValue: 54, inflatedValue: 54, vorpShare: 0.18 },
      { playerId: 'jefferson', name: 'Justin Jefferson', position: 'WR' as const, age: 26, draftScore: 95, fairValue: 50, inflatedValue: 50, vorpShare: 0.16 },
      { ...hall, playerId: 'breece-hall', name: 'Breece Hall', draftScore: 88, fairValue: 42, inflatedValue: 42 },
      { playerId: 'olave', name: 'Chris Olave', position: 'WR' as const, age: 25, draftScore: 60, fairValue: 15, inflatedValue: 15, vorpShare: 0.04 },
      { playerId: 'conner', name: 'James Conner', position: 'RB' as const, age: 30, draftScore: 62, fairValue: 16, inflatedValue: 16, vorpShare: 0.04 },
      { playerId: 'baker', name: 'Baker Mayfield', position: 'QB' as const, age: 30, draftScore: 55, fairValue: 12, inflatedValue: 12, vorpShare: 0.02 },
      { playerId: 'ferguson', name: 'Jake Ferguson', position: 'TE' as const, age: 26, draftScore: 48, fairValue: 10, inflatedValue: 10, vorpShare: 0.02 },
      { playerId: 'shaheed', name: 'Rashid Shaheed', position: 'WR' as const, age: 27, draftScore: 30, fairValue: 5, inflatedValue: 5, vorpShare: 0.01 },
      { playerId: 'rb-a', name: 'Depth RB', position: 'RB' as const, age: 24, draftScore: 24, fairValue: 6, inflatedValue: 6, vorpShare: 0.01 },
      { playerId: 'wr-a', name: 'Depth WR', position: 'WR' as const, age: 24, draftScore: 16, fairValue: 4, inflatedValue: 4, vorpShare: 0.01 },
      { playerId: 'qb-a', name: 'Depth QB', position: 'QB' as const, age: 24, draftScore: 14, fairValue: 4, inflatedValue: 4, vorpShare: 0.01 },
      { playerId: 'te-a', name: 'Depth TE', position: 'TE' as const, age: 24, draftScore: 14, fairValue: 4, inflatedValue: 4, vorpShare: 0.01 },
    ];
    const { fixture } = await createAuction(
      makeState({
        values,
        userBudget: brokeYou,
        budgets: [brokeYou, rival],
        signedRoster: [
          { playerId: 'rb1', name: 'Star RB', position: 'RB', amount: 48, contractYears: 1, team: 'SF' },
          { playerId: 'wr1', name: 'Star WR', position: 'WR', amount: 42, contractYears: 1, team: 'CIN' },
        ],
        teamRosters: [
          {
            rosterId: you.rosterId,
            name: you.name,
            players: [
              { playerId: 'rb1', name: 'Star RB', position: 'RB', amount: 48, contractYears: 1, team: 'SF' },
              { playerId: 'wr1', name: 'Star WR', position: 'WR', amount: 42, contractYears: 1, team: 'CIN' },
            ],
          },
          { rosterId: rival.rosterId, name: rival.name, players: [] },
        ],
      }),
    );
    const root: HTMLElement = fixture.nativeElement;
    const roomTab = Array.from(root.querySelectorAll('.panel-tab')).find((el) =>
      el.textContent?.includes('Budgets'),
    ) as HTMLButtonElement;
    roomTab.click();
    fixture.detectChanges();

    const youCard = Array.from(root.querySelectorAll('.team-room')).find((node) =>
      node.classList.contains('you'),
    );
    const rec = youCard?.querySelector('.team-targets')?.textContent ?? '';
    expect(rec).toMatch(/Recommended next/i);
    expect(rec).not.toContain('Christian McCaffrey');
    expect(rec).not.toContain("Ja'Marr Chase");
    expect(rec).not.toContain('Justin Jefferson');
    const prices = Array.from(youCard?.querySelectorAll('.team-targets .dl-mono') ?? []).map((el) =>
      Number((el.textContent ?? '').replace('$', '')),
    );
    expect(prices.length).toBeGreaterThan(0);
    expect(prices.every((n) => n < 30)).toBe(true);
  });

  it('lists actual team names in the on-the-block winner dropdown', async () => {
    const { fixture } = await createAuction(makeState());
    const select = fixture.nativeElement.querySelector('.winner-form select') as HTMLSelectElement;
    const labels = Array.from(select.options).map((opt) => opt.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(['You · $200 left', 'Team 2 · $200 left']);
  });

  it('lets you rename a team on the room tab and updates the winner dropdown', async () => {
    const { fixture, renameAuctionTeam } = await createAuction(makeState());
    const root: HTMLElement = fixture.nativeElement;
    const roomTab = Array.from(root.querySelectorAll('.panel-tab')).find((el) =>
      el.textContent?.includes('Budgets'),
    ) as HTMLButtonElement;
    roomTab.click();
    fixture.detectChanges();

    const input = root.querySelector('#team-name-roster-2') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.dispatchEvent(new Event('focus'));
    input.value = 'The Geckos';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(renameAuctionTeam).not.toHaveBeenCalled();

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(renameAuctionTeam).toHaveBeenCalledTimes(1);
    expect(renameAuctionTeam).toHaveBeenCalledWith('league-1', 'roster-2', 'The Geckos');
    const select = root.querySelector('.winner-form select') as HTMLSelectElement;
    const labels = Array.from(select.options).map((opt) => opt.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toContain('The Geckos · $200 left');
    expect(labels).not.toContain('Team 2 · $200 left');
  });

  it('drops a signed keeper after confirming the year-based penalty', async () => {
    const releaseAuctionContract = vi.fn(() => of(makeState()));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture } = await createAuction(
      makeState({
        signedRoster: [
          {
            playerId: 'puka-nacua',
            name: 'Puka Nacua',
            position: 'WR',
            amount: 15,
            contractYears: 2,
            team: 'LAR',
            contractYear: 4,
            dropPenalty: 3,
          },
        ],
        teamRosters: [
          {
            rosterId: you.rosterId,
            name: you.name,
            players: [
              {
                playerId: 'puka-nacua',
                name: 'Puka Nacua',
                position: 'WR',
                amount: 15,
                contractYears: 2,
                team: 'LAR',
                contractYear: 4,
                dropPenalty: 3,
              },
            ],
          },
          { rosterId: rival.rosterId, name: rival.name, players: [] },
        ],
      }),
      { releaseAuctionContract },
    );
    const root: HTMLElement = fixture.nativeElement;
    const roomTab = Array.from(root.querySelectorAll('.panel-tab')).find((el) =>
      el.textContent?.includes('Budgets'),
    ) as HTMLButtonElement;
    roomTab.click();
    fixture.detectChanges();

    const drop = Array.from(root.querySelectorAll('.drop-btn')).find((el) =>
      el.textContent?.includes('Drop $3'),
    ) as HTMLButtonElement;
    expect(drop).toBeTruthy();
    drop.click();
    fixture.detectChanges();
    expect(confirm).toHaveBeenCalled();
    expect(releaseAuctionContract).toHaveBeenCalledWith('league-1', 'puka-nacua');
    confirm.mockRestore();
  });

  it('lets you claim another franchise from the room tab', async () => {
    const claimed = makeState({
      userBudget: { ...rival, name: 'Team 2' },
      budgets: [
        { ...you, name: 'You' },
        { ...rival, name: 'Team 2' },
      ],
    });
    const claimAuctionTeam = vi.fn(() => of(claimed));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture } = await createAuction(makeState(), { claimAuctionTeam });
    const root: HTMLElement = fixture.nativeElement;
    const roomTab = Array.from(root.querySelectorAll('.panel-tab')).find((el) =>
      el.textContent?.includes('Budgets'),
    ) as HTMLButtonElement;
    roomTab.click();
    fixture.detectChanges();

    const youCard = Array.from(root.querySelectorAll('.team-room')).find((node) =>
      node.classList.contains('you'),
    );
    expect(youCard?.textContent).toContain('You');
    expect(youCard?.querySelector('.claim-team-btn')).toBeNull();

    const claim = Array.from(root.querySelectorAll('.claim-team-btn')).find((el) =>
      el.textContent?.includes('This is my team'),
    ) as HTMLButtonElement;
    expect(claim).toBeTruthy();
    claim.click();
    fixture.detectChanges();
    expect(confirm).toHaveBeenCalled();
    expect(claimAuctionTeam).toHaveBeenCalledWith('league-1', 'roster-2');
    confirm.mockRestore();
  });

  it('adds K and DEF filters when the league roster has those slots', async () => {
    const kicker = {
      playerId: 'brandon-aubrey',
      name: 'Brandon Aubrey',
      position: 'K' as const,
      age: 31,
      draftScore: 20,
      fairValue: 4,
      inflatedValue: 4,
      vorpShare: 0,
    };
    const { fixture } = await createAuction(makeState({ values: [hall, kicker] }), {
      league: {
        ...makeLeague(),
        roster: {
          qb: 1,
          rb: 2,
          wr: 2,
          te: 1,
          flex: 2,
          superflex: 0,
          k: 1,
          def: 1,
          bench: 5,
          totalStarters: 10,
        },
      },
    });
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.pos-tab')).map((el) =>
      (el as HTMLElement).textContent?.trim(),
    );
    expect(tabs).toEqual(['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
  });

  it('hides K and DEF filters in skill-only leagues', async () => {
    const { fixture } = await createAuction(makeState());
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.pos-tab')).map((el) =>
      (el as HTMLElement).textContent?.trim(),
    );
    expect(tabs).toEqual(['ALL', 'QB', 'RB', 'WR', 'TE']);
  });
});

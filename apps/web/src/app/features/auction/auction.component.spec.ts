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
  bid = vi.fn(() => of(state)),
) {
  await TestBed.configureTestingModule({
    imports: [AuctionComponent],
    providers: [
      provideRouter([]),
      {
        provide: ApiService,
        useValue: {
          league: () => of(makeLeague()),
          auctionState: () => of(state),
          auctionBid: bid,
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
  return { fixture, bid };
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
    const { fixture } = await createAuction(makeState(), bid);
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
    const signed = Array.from(root.querySelectorAll('.team-room')).find((node) =>
      node.textContent?.includes('Team 2'),
    );
    expect(signed?.textContent).toContain('Breece Hall');
    expect(signed?.textContent).toContain('$33');
  });
});

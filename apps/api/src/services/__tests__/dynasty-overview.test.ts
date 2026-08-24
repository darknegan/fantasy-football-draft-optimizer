import { describe, expect, it } from 'vitest';
import { AppStore } from '../store.js';
import { SEED_PLAYERS } from '../../data/seed-players.js';

function player(id: string) {
  const seed = SEED_PLAYERS.find((s) => s.player.id === id);
  if (!seed) throw new Error(`missing seed ${id}`);
  return seed;
}

describe('dynastyOverview league rosters', () => {
  it('leaves every team empty before any picks or auction bids', () => {
    const store = new AppStore([player('josh-allen'), player('bijan-robinson')]);
    const { auction, dynasty } = store.seedDemoLeagues('demo-user');

    for (const leagueId of [auction.id, dynasty.id]) {
      const overview = store.dynastyOverview(leagueId);
      expect(overview?.teamRosters).toHaveLength(12);
      expect(overview?.rosterBoard).toEqual([]);
      expect(overview?.summary?.rosterCount).toBe(0);
      for (const team of overview?.teamRosters ?? []) {
        expect(team.players).toEqual([]);
      }
    }
  });

  it('returns a card for every team in a snake league, grouped by position', () => {
    const store = new AppStore([
      player('josh-allen'),
      player('bijan-robinson'),
      player('jamarr-chase'),
      player('brock-bowers'),
      player('saquon-barkley'),
    ]);
    const { demo } = store.seedDemoLeagues('demo-user');

    store.applyPick(demo.id, {
      pickNumber: 1,
      round: 1,
      slot: 3,
      playerId: 'josh-allen',
      rosterId: 'roster-user',
      source: 'manual',
    });
    store.applyPick(demo.id, {
      pickNumber: 2,
      round: 1,
      slot: 3,
      playerId: 'bijan-robinson',
      rosterId: 'roster-user',
      source: 'manual',
    });
    store.applyPick(demo.id, {
      pickNumber: 3,
      round: 1,
      slot: 3,
      playerId: 'jamarr-chase',
      rosterId: 'roster-user',
      source: 'manual',
    });
    store.applyPick(demo.id, {
      pickNumber: 4,
      round: 1,
      slot: 3,
      playerId: 'brock-bowers',
      rosterId: 'roster-user',
      source: 'manual',
    });
    store.applyPick(demo.id, {
      pickNumber: 5,
      round: 1,
      slot: 1,
      playerId: 'saquon-barkley',
      rosterId: 'roster-1',
      source: 'manual',
    });

    const overview = store.dynastyOverview(demo.id);
    expect(overview?.teamRosters).toHaveLength(12);
    expect(overview?.isAuction).toBe(false);

    const you = overview?.teamRosters?.find((t) => t.isUser);
    expect(you?.name).toBe('You');
    expect(you?.players.map((p) => p.position)).toEqual(['QB', 'RB', 'WR', 'TE']);
    expect(you?.players.map((p) => p.playerId)).toEqual([
      'josh-allen',
      'bijan-robinson',
      'jamarr-chase',
      'brock-bowers',
    ]);

    const team1 = overview?.teamRosters?.find((t) => t.rosterId === 'roster-1');
    expect(team1?.players.map((p) => p.playerId)).toEqual(['saquon-barkley']);
    expect(overview?.teamRosters?.every((t) => t.players.every((p) => p.amount == null))).toBe(
      true,
    );
  });

  it('includes every auction team and the winning bid on each signed player', () => {
    const store = new AppStore([player('josh-allen'), player('bijan-robinson')]);
    const { auction } = store.seedDemoLeagues('demo-user');
    const before = store.auctionState(auction.id)!;
    const rival = before.budgets.find((b) => b.rosterId !== before.userBudget.rosterId)!;

    store.placeAuctionBid(auction.id, {
      playerId: 'josh-allen',
      amount: 41,
      rosterId: rival.rosterId,
    });
    store.placeAuctionBid(auction.id, {
      playerId: 'bijan-robinson',
      amount: 58,
      rosterId: before.userBudget.rosterId,
    });

    const overview = store.dynastyOverview(auction.id);
    expect(overview?.isAuction).toBe(true);
    expect(overview?.teamRosters).toHaveLength(12);

    const winner = overview?.teamRosters?.find((t) => t.rosterId === rival.rosterId);
    expect(winner?.players).toEqual([
      expect.objectContaining({ playerId: 'josh-allen', position: 'QB', amount: 41 }),
    ]);
    expect(winner?.spent).toBe(41);

    const you = overview?.teamRosters?.find((t) => t.isUser);
    expect(you?.players).toEqual([
      expect.objectContaining({ playerId: 'bijan-robinson', position: 'RB', amount: 58 }),
    ]);
    expect(you?.spent).toBe(58);
    expect(you?.remaining).toBe(before.userBudget.remaining - 58);
  });

  it('surfaces pick.amount when Sleeper-style auction metadata is stored on the pick', () => {
    const store = new AppStore([player('jamarr-chase')]);
    const { auction } = store.seedDemoLeagues('demo-user');
    store.applyPick(auction.id, {
      pickNumber: 1,
      round: 1,
      slot: 2,
      playerId: 'jamarr-chase',
      rosterId: 'roster-2',
      source: 'sleeper',
      amount: 33,
    });

    const overview = store.dynastyOverview(auction.id);
    const team2 = overview?.teamRosters?.find((t) => t.rosterId === 'roster-2');
    expect(team2?.players[0]).toMatchObject({
      playerId: 'jamarr-chase',
      amount: 33,
    });
  });
});

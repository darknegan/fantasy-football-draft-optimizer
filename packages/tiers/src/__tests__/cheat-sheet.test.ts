import { describe, expect, it } from 'vitest';
import { buildCheatSheet, type CheatSheetPlayer } from '../cheat-sheet.js';

const player = (over: Partial<CheatSheetPlayer> & { id: string }): CheatSheetPlayer => ({
  name: over.id,
  position: 'WR',
  draftScore: 70,
  ceilingScore: 10,
  provisional: false,
  ceilingKnownFactors: 5,
  adpRoundPick: '1.01',
  ...over,
});

describe('buildCheatSheet', () => {
  it('groups players by position', () => {
    const sheet = buildCheatSheet([
      player({ id: 'wr1', position: 'WR' }),
      player({ id: 'rb1', position: 'RB' }),
    ]);
    expect(
      sheet.every((g) => g.tiers.every((t) => t.players.every((p) => p.position === g.position))),
    ).toBe(true);
  });

  it('uses absolute bands, so a thin position gets no S tier', () => {
    // Best TE scores 69 — an A under the current global thresholds (S starts at
    // 70). The old min-max implementation promoted each position's best player
    // to the top tier by construction; that is exactly the behaviour being
    // removed.
    const sheet = buildCheatSheet([
      player({ id: 'te1', position: 'TE', draftScore: 69 }),
      player({ id: 'te2', position: 'TE', draftScore: 60 }),
      player({ id: 'te3', position: 'TE', draftScore: 55 }),
    ]);
    const te = sheet.find((g) => g.position === 'TE')!;
    expect(te.tiers.map((t) => t.tier)).not.toContain('S');
  });

  it('gives the same score the same band across positions', () => {
    const sheet = buildCheatSheet([
      player({ id: 'wr', position: 'WR', draftScore: 78 }),
      player({ id: 'rb', position: 'RB', draftScore: 78 }),
    ]);
    const bandOf = (pos: string, id: string) =>
      sheet.find((g) => g.position === pos)!.tiers.find((t) => t.players.some((p) => p.id === id))!
        .tier;
    expect(bandOf('WR', 'wr')).toBe(bandOf('RB', 'rb'));
  });

  it('keeps no-data players in the list instead of a separate unranked section', () => {
    const sheet = buildCheatSheet([
      player({ id: 'measured', position: 'WR', draftScore: 80 }),
      player({ id: 'nodata', position: 'WR', draftScore: 999, ceilingKnownFactors: 0 }),
    ]);
    const wr = sheet.find((g) => g.position === 'WR')!;
    const allIds = wr.tiers.flatMap((t) => t.players.map((p) => p.id));
    expect(allIds).toContain('nodata');
    expect(wr).not.toHaveProperty('unranked');
  });

  it('does not launder a no-data player into the D (Speculative) tier', () => {
    // A no-data player has draftScore made of defaults, not a judgment, so it
    // must never be graded a real letter — including 'D'. It should surface
    // in its own distinct tier instead. Regression test for the bug where
    // `qualityBand(...) ?? 'D'` merged null (no-data) into the real D bucket,
    // handing it the same letter grade the API's own qualityBand refuses to
    // give it.
    const sheet = buildCheatSheet([
      player({ id: 'real-d', position: 'WR', draftScore: 20, ceilingKnownFactors: 5 }),
      player({ id: 'nodata', position: 'WR', draftScore: 999, ceilingKnownFactors: 0 }),
    ]);
    const wr = sheet.find((g) => g.position === 'WR')!;
    const dTier = wr.tiers.find((t) => t.tier === 'D');
    const noDataTier = wr.tiers.find((t) => t.tier === null);

    expect(dTier?.players.map((p) => p.id)).toEqual(['real-d']);
    expect(dTier?.players.some((p) => p.id === 'nodata')).toBe(false);
    expect(noDataTier?.players.map((p) => p.id)).toEqual(['nodata']);
  });

  it('does not let a no-data player change a measured player band', () => {
    // The old min-max implementation had an inflated no-data score stretch the
    // range and shift everyone else. Absolute bands make that structurally
    // impossible — this test pins that property.
    const without = buildCheatSheet([player({ id: 'measured', draftScore: 80 })]);
    const withNoData = buildCheatSheet([
      player({ id: 'measured', draftScore: 80 }),
      player({ id: 'nodata', draftScore: 999, ceilingKnownFactors: 0 }),
    ]);
    const bandOf = (sheet: ReturnType<typeof buildCheatSheet>) =>
      sheet
        .find((g) => g.position === 'WR')!
        .tiers.find((t) => t.players.some((p) => p.id === 'measured'))!.tier;
    expect(bandOf(withNoData)).toBe(bandOf(without));
  });

  it('omits positions with no players and tiers with no members', () => {
    const sheet = buildCheatSheet([player({ id: 'wr1', position: 'WR' })]);
    expect(sheet.every((g) => g.tiers.every((t) => t.players.length > 0))).toBe(true);
  });

  it('sorts players by draftScore within a tier', () => {
    // Both scores fall in the B band (56-62 under the current thresholds) so
    // they land in the same tier bucket and the within-tier sort is exercised.
    const sheet = buildCheatSheet([
      player({ id: 'low', draftScore: 56 }),
      player({ id: 'high', draftScore: 58 }),
    ]);
    const wr = sheet.find((g) => g.position === 'WR')!;
    expect(wr.tiers[0]!.players.map((p) => p.id)).toEqual(['high', 'low']);
  });
});

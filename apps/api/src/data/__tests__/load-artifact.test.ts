import { describe, expect, it } from 'vitest';
import { seedPlayersFromArtifact, type PlayerFactorsArtifact } from '../load-artifact.js';

function artifact(overrides: Partial<PlayerFactorsArtifact> = {}): PlayerFactorsArtifact {
  return {
    schema_version: 2,
    generated_at: '2026-08-09T00:00:00Z',
    players: [],
    ...overrides,
  };
}

describe('seedPlayersFromArtifact', () => {
  it('rejects a schema_version older than the bio block', () => {
    expect(() => seedPlayersFromArtifact(artifact({ schema_version: 1 }))).toThrow(
      /schema_version/,
    );
  });

  it('skips a player with no usable bio, with a reason', () => {
    const doc = artifact({
      players: [
        {
          sleeper_id: null,
          name: 'No Bio Guy',
          position: 'RB',
          team: 'DET',
          adp: 300,
          adp_round_pick: '25.01',
          matched: false,
          bio: {
            age: null,
            seasons_in_league: null,
            draft_year: null,
            status: null,
            provenance: 'missing:no_sleeper_id',
            top12_finish_count: 0,
            top12_finish_seasons: [],
          },
          factors: {},
        },
      ],
    });
    const { players, skipped } = seedPlayersFromArtifact(doc);
    expect(players).toHaveLength(0);
    expect(skipped).toEqual([
      { name: 'No Bio Guy', position: 'RB', reason: 'bio missing:no_sleeper_id' },
    ]);
  });

  it('builds a valid SeedPlayer from a fully-populated artifact entry', () => {
    const doc = artifact({
      players: [
        {
          sleeper_id: '9221',
          name: 'Jahmyr Gibbs',
          position: 'RB',
          team: 'DET',
          adp: 2.2,
          adp_round_pick: '1.02',
          matched: true,
          bio: {
            age: 24,
            seasons_in_league: 3,
            draft_year: 2023,
            status: 'Active',
            provenance: 'measured',
            top12_finish_count: 3,
            top12_finish_seasons: [2023, 2024, 2025],
          },
          factors: {
            touches: { value: 18.824, provenance: 'measured', note: null },
            ol_run_block_rank: {
              value: null,
              provenance: 'unsourced',
              note: 'not freely redistributable (PFF)',
            },
            // The real artifact always includes these two, permanently null —
            // reproduced here so the loader is tested against the actual shape,
            // not an idealized one that happens to omit the tricky part.
            archetype: {
              value: null,
              provenance: 'unsourced',
              note: 'categorical, graded by DraftLab rather than benchmarked',
            },
            injury_concern: {
              value: null,
              provenance: 'unsourced',
              note: 'categorical, graded by DraftLab rather than benchmarked',
            },
          },
        },
      ],
    });

    const { players, skipped } = seedPlayersFromArtifact(doc);
    expect(skipped).toHaveLength(0);
    expect(players).toHaveLength(1);

    const sp = players[0];
    expect(sp.player).toMatchObject({
      id: 'jahmyr-gibbs',
      externalIds: { sleeper: '9221' },
      name: 'Jahmyr Gibbs',
      team: 'DET',
      position: 'RB',
      age: 24,
      seasonsInLeague: 3,
      draftYear: 2023,
      draftRound: null,
      status: 'active',
      hasPositionalTop12Finish: true,
      positionalTop12FinishCount: 3,
    });

    // Real values pass through with their provenance intact...
    expect(sp.factors).toContainEqual({
      factorId: 'touches',
      value: 18.824,
      provenance: 'measured',
    });
    // ...and so do honest gaps — a null value is not silently dropped.
    expect(sp.factors).toContainEqual({
      factorId: 'ol_run_block_rank',
      value: null,
      provenance: 'unsourced',
    });
    // Archetype is computed here (classifyArchetype), never trusted from the artifact,
    // which never supplies one. 3 top-12 finishes -> not a breakout, and young enough
    // and not a veteran -> IN_THEIR_PRIME. Exactly one entry — the artifact's own null
    // 'archetype' placeholder must not survive alongside the computed one.
    const archetypeEntries = sp.factors.filter((f) => f.factorId === 'archetype');
    expect(archetypeEntries).toHaveLength(1);
    expect(archetypeEntries[0]).toMatchObject({
      categorical: 'IN_THEIR_PRIME',
      provenance: 'computed:classifyArchetype',
    });
    // No injury data source yet — the artifact's null placeholder is dropped
    // rather than carried over, so the factor is genuinely absent (grades
    // 'unknown'), not present-but-permanently-null.
    expect(sp.factors.some((f) => f.factorId === 'injury_concern')).toBe(false);

    expect(sp.market).toEqual({
      adpRoundPick: '1.02',
      fseRank: null,
      espnProjectionRank: null,
      projectedRank: null,
    });
  });

  it('passes projected_rank through into market.projectedRank when present', () => {
    const doc = artifact({
      players: [
        {
          sleeper_id: '9221',
          name: 'Jahmyr Gibbs',
          position: 'RB',
          team: 'DET',
          adp: 2.2,
          adp_round_pick: '1.02',
          matched: true,
          projected_rank: 3,
          bio: {
            age: 24,
            seasons_in_league: 3,
            draft_year: 2023,
            status: 'Active',
            provenance: 'measured',
            top12_finish_count: 3,
            top12_finish_seasons: [2023, 2024, 2025],
          },
          factors: {},
        },
      ],
    });
    const { players } = seedPlayersFromArtifact(doc);
    expect(players[0].market.projectedRank).toBe(3);
  });

  it.each([
    ['Active', 'active'],
    ['Injured Reserve', 'injured'],
    ['PUP', 'injured'],
    ['Suspended', 'suspended'],
    ['Inactive', 'inactive'],
    [null, 'active'],
  ])('maps Sleeper status %s -> %s', (raw, expected) => {
    const doc = artifact({
      players: [
        {
          sleeper_id: '1',
          name: 'Status Test',
          position: 'WR',
          team: 'KC',
          adp: 50,
          adp_round_pick: '5.02',
          matched: true,
          bio: {
            age: 25,
            seasons_in_league: 2,
            draft_year: 2024,
            status: raw,
            provenance: 'measured',
            top12_finish_count: 0,
            top12_finish_seasons: [],
          },
          factors: {},
        },
      ],
    });
    const { players } = seedPlayersFromArtifact(doc);
    expect(players[0].player.status).toBe(expected);
  });
});

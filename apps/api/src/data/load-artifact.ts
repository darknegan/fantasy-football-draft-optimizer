import { classifyArchetype } from '@draftlab/evaluation-engine';
import type { FactorInput, Player, PlayerStatus, Position } from '@draftlab/domain';
import type { SeedPlayer } from './seed-players.js';

/**
 * Loads SeedPlayer[] from sleeperMCP's artifacts/player_factors.json (schema_version 2+).
 *
 * Ownership boundary, same as everywhere else in that repo: sleeperMCP reports
 * measurements and where they came from; this file is the "that side" — it
 * decides what a measurement MEANS, which for archetype is a call to
 * classifyArchetype rather than trusting a categorical value from the artifact
 * (the artifact never supplies one).
 *
 * injury_concern is artifact-sourced when it has a categorical value. A null
 * placeholder remains omitted rather than guessed. grade-factor.ts treats a
 * missing factor as grade 'unknown' with its own weight — an honest gap, not a
 * silent zero.
 */

interface ArtifactFactor {
  value: number | null;
  provenance: string;
  note: string | null;
  categorical?: string | null;
}

interface ArtifactBio {
  age: number | null;
  seasons_in_league: number | null;
  draft_year: number | null;
  status: string | null;
  provenance: string;
  top5_finish_count?: number;
  top8_finish_count?: number;
  top12_finish_count?: number;
}

interface ArtifactPlayer {
  sleeper_id: string | null;
  name: string;
  position: Position;
  team: string | null;
  adp: number | null;
  adp_round_pick: string | null;
  matched: boolean;
  /** Mechanical fallback for fseRank/espnProjectionRank. schema_version 3+; absent on older artifacts. */
  projected_rank?: number | null;
  /** Season-long projected fantasy points. Present on current sleeperMCP artifacts. */
  projected_points?: number | null;
  /** WR/RB only: rank among same-team, same-position teammates. schema_version 4+. */
  team_position_rank?: number | null;
  bio: ArtifactBio;
  factors: Record<string, ArtifactFactor>;
}

export interface PlayerFactorsArtifact {
  schema_version: number;
  generated_at: string;
  players: ArtifactPlayer[];
}

export interface SkippedPlayer {
  name: string;
  position: string;
  reason: string;
}

export interface LoadArtifactResult {
  players: SeedPlayer[];
  skipped: SkippedPlayer[];
}

const MIN_SCHEMA_VERSION = 2; // schema_version 1 artifacts have no `bio` block

// Sleeper's free-text status strings, bucketed into DraftLab's four-value enum.
// Unrecognized or missing strings default to 'active' — the artifact is built
// from this season's ADP universe, so "we don't know" is far more likely a
// healthy active player than one of the other three.
function mapStatus(raw: string | null): PlayerStatus {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('suspend')) return 'suspended';
  if (s.includes('inactive')) return 'inactive';
  if (s.includes('injured') || s.includes('ir') || s.includes('pup') || s.includes('out')) {
    return 'injured';
  }
  return 'active';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents (e.g. é -> e)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Pure transform, parsed-JSON in, SeedPlayer[] out — kept separate from file
 * I/O so it's testable without a real artifact on disk.
 */
export function seedPlayersFromArtifact(doc: PlayerFactorsArtifact): LoadArtifactResult {
  if (doc.schema_version < MIN_SCHEMA_VERSION) {
    throw new Error(
      `player_factors.json schema_version ${doc.schema_version} predates the bio block ` +
        `(added in ${MIN_SCHEMA_VERSION}); regenerate with a current build_factors.py`,
    );
  }

  const players: SeedPlayer[] = [];
  const skipped: SkippedPlayer[] = [];

  for (const p of doc.players) {
    if (p.bio.provenance !== 'measured') {
      skipped.push({ name: p.name, position: p.position, reason: `bio ${p.bio.provenance}` });
      continue;
    }
    if (p.bio.age == null || p.bio.seasons_in_league == null || p.bio.draft_year == null) {
      skipped.push({ name: p.name, position: p.position, reason: 'incomplete bio fields' });
      continue;
    }

    const player: Player = {
      id: slugify(p.name),
      externalIds: { sleeper: p.sleeper_id ?? undefined },
      name: p.name,
      team: p.team ?? 'FA',
      position: p.position,
      age: p.bio.age,
      seasonsInLeague: p.bio.seasons_in_league,
      draftYear: p.bio.draft_year,
      draftRound: null,
      status: mapStatus(p.bio.status),
      positionalTop5FinishCount: p.bio.top5_finish_count ?? 0,
      positionalTop8FinishCount: p.bio.top8_finish_count ?? 0,
      positionalTop12FinishCount: p.bio.top12_finish_count ?? 0,
      teamPositionRank: p.team_position_rank ?? null,
    };

    // Archetype is DraftLab-computed below, never trusted from the artifact.
    // Injury concern is passed through only when the artifact supplies a
    // categorical value; its null placeholder remains genuinely unknown.
    const factors: FactorInput[] = Object.entries(p.factors)
      .filter(([factorId, f]) => {
        if (factorId === 'archetype') return false;
        if (factorId === 'injury_concern') {
          return f.categorical != null && f.categorical !== '';
        }
        return true;
      })
      .map(([factorId, f]) => ({
        factorId,
        value: f.value,
        provenance: f.provenance,
        ...(f.categorical ? { categorical: f.categorical as FactorInput['categorical'] } : {}),
      }));

    factors.push({
      factorId: 'archetype',
      value: 1,
      categorical: classifyArchetype(player),
      provenance: 'computed:classifyArchetype',
    });

    players.push({
      player,
      factors,
      market: {
        adpRoundPick: p.adp_round_pick ?? 'N/A',
        fseRank: null,
        espnProjectionRank: null,
        projectedRank: p.projected_rank ?? null,
        projectedPoints: p.projected_points ?? null,
      },
    });
  }

  return { players, skipped };
}

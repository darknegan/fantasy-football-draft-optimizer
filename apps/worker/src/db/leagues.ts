import type { League, Platform, RosterShape, ScoringProfile, StrategyId } from '@draftlab/domain';
import type { Sql } from './client.js';

function mapLeague(row: Record<string, unknown>): League {
  return {
    id: String(row['id']),
    userId: String(row['user_id']),
    name: String(row['name']),
    platform: row['platform'] as Platform,
    externalId: row['external_id'] != null ? String(row['external_id']) : undefined,
    type: row['type'] as League['type'],
    draftType: row['draft_type'] as League['draftType'],
    teamCount: Number(row['team_count']),
    season: Number(row['season']),
    scoring: row['scoring'] as ScoringProfile,
    roster: row['roster'] as RosterShape,
    draftSlot: row['draft_slot'] != null ? Number(row['draft_slot']) : undefined,
    strategyId: (row['strategy_id'] as StrategyId | null) ?? undefined,
    sleeperDraftId: row['sleeper_draft_id'] != null ? String(row['sleeper_draft_id']) : undefined,
    sleeperUserId: row['sleeper_user_id'] != null ? String(row['sleeper_user_id']) : undefined,
    dynastyMode: (row['dynasty_mode'] as League['dynastyMode']) ?? undefined,
    auctionBudget: row['auction_budget'] != null ? Number(row['auction_budget']) : undefined,
  };
}

export async function listLeaguesForUser(sql: Sql, userId: string): Promise<League[]> {
  const rows = await sql`
    SELECT * FROM leagues WHERE user_id = ${userId} ORDER BY created_at ASC
  `;
  return rows.map((row) => mapLeague(row as Record<string, unknown>));
}

export async function getLeagueForUser(
  sql: Sql,
  userId: string,
  leagueId: string,
): Promise<League | null> {
  const rows = await sql`
    SELECT * FROM leagues WHERE id = ${leagueId} AND user_id = ${userId}
  `;
  return rows[0] ? mapLeague(rows[0] as Record<string, unknown>) : null;
}

export async function upsertLeagueRow(sql: Sql, league: League): Promise<League> {
  if (!league.userId) throw new Error('League.userId is required');

  if (league.platform === 'sleeper' && league.externalId) {
    const existing = await sql`
      SELECT id FROM leagues
      WHERE user_id = ${league.userId}
        AND platform = 'sleeper'
        AND external_id = ${league.externalId}
    `;
    if (existing[0]) {
      const id = String(existing[0]['id']);
      const rows = await sql`
        UPDATE leagues SET
          name = ${league.name},
          type = ${league.type},
          draft_type = ${league.draftType},
          team_count = ${league.teamCount},
          season = ${league.season},
          scoring = ${sql.json(league.scoring as never)},
          roster = ${sql.json(league.roster as never)},
          draft_slot = ${league.draftSlot ?? null},
          strategy_id = ${league.strategyId ?? null},
          sleeper_draft_id = ${league.sleeperDraftId ?? null},
          sleeper_user_id = ${league.sleeperUserId ?? null},
          dynasty_mode = ${league.dynastyMode ?? null},
          auction_budget = ${league.auctionBudget ?? null}
        WHERE id = ${id}
        RETURNING *
      `;
      return mapLeague(rows[0] as Record<string, unknown>);
    }
  }

  const rows = await sql`
    INSERT INTO leagues (
      id, user_id, name, platform, external_id, type, draft_type, team_count, season,
      scoring, roster, draft_slot, strategy_id, sleeper_draft_id, sleeper_user_id,
      dynasty_mode, auction_budget
    ) VALUES (
      COALESCE(${league.id || null}::uuid, gen_random_uuid()),
      ${league.userId},
      ${league.name},
      ${league.platform},
      ${league.externalId ?? null},
      ${league.type},
      ${league.draftType},
      ${league.teamCount},
      ${league.season},
      ${sql.json(league.scoring as never)},
      ${sql.json(league.roster as never)},
      ${league.draftSlot ?? null},
      ${league.strategyId ?? null},
      ${league.sleeperDraftId ?? null},
      ${league.sleeperUserId ?? null},
      ${league.dynastyMode ?? null},
      ${league.auctionBudget ?? null}
    )
    RETURNING *
  `;
  return mapLeague(rows[0] as Record<string, unknown>);
}

export async function updateLeagueRow(
  sql: Sql,
  userId: string,
  leagueId: string,
  patch: Partial<League>,
): Promise<League | null> {
  const existing = await getLeagueForUser(sql, userId, leagueId);
  if (!existing) return null;
  const next: League = { ...existing, ...patch, id: existing.id, userId: existing.userId };
  const rows = await sql`
    UPDATE leagues SET
      name = ${next.name},
      strategy_id = ${next.strategyId ?? null},
      draft_slot = ${next.draftSlot ?? null},
      sleeper_draft_id = ${next.sleeperDraftId ?? null},
      dynasty_mode = ${next.dynastyMode ?? null},
      auction_budget = ${next.auctionBudget ?? null}
    WHERE id = ${leagueId} AND user_id = ${userId}
    RETURNING *
  `;
  return rows[0] ? mapLeague(rows[0] as Record<string, unknown>) : null;
}

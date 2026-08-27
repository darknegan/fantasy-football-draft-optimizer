import type { League, Platform, RosterShape, ScoringProfile, StrategyId } from '@draftlab/domain';
import type { Pool } from 'pg';

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
    contractRules: (row['format_state'] as League['formatState'])?.contractRules,
    formatState:
      row['format_state'] && typeof row['format_state'] === 'object'
        ? (row['format_state'] as League['formatState'])
        : undefined,
  };
}

export async function listLeaguesForUser(pool: Pool, userId: string): Promise<League[]> {
  const result = await pool.query(
    `SELECT * FROM leagues WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return result.rows.map((row) => mapLeague(row));
}

export async function getLeagueForUser(
  pool: Pool,
  userId: string,
  leagueId: string,
): Promise<League | null> {
  const result = await pool.query(`SELECT * FROM leagues WHERE id = $1 AND user_id = $2`, [
    leagueId,
    userId,
  ]);
  const row = result.rows[0];
  return row ? mapLeague(row) : null;
}

export async function upsertLeagueRow(pool: Pool, league: League): Promise<League> {
  if (!league.userId) throw new Error('League.userId is required');

  if (league.externalId) {
    const existing = await pool.query(
      `SELECT id FROM leagues WHERE user_id = $1 AND platform = $2 AND external_id = $3`,
      [league.userId, league.platform, league.externalId],
    );
    if (existing.rows[0]) {
      const id = String(existing.rows[0]['id']);
      const result = await pool.query(
        `UPDATE leagues SET
           name = $2, type = $3, draft_type = $4, team_count = $5, season = $6,
           scoring = $7, roster = $8, draft_slot = $9, strategy_id = $10,
           sleeper_draft_id = $11, sleeper_user_id = $12, dynasty_mode = $13, auction_budget = $14,
           format_state = COALESCE($15::jsonb, format_state)
         WHERE id = $1
         RETURNING *`,
        [
          id,
          league.name,
          league.type,
          league.draftType,
          league.teamCount,
          league.season,
          JSON.stringify(league.scoring),
          JSON.stringify(league.roster),
          league.draftSlot ?? null,
          league.strategyId ?? null,
          league.sleeperDraftId ?? null,
          league.sleeperUserId ?? null,
          league.dynastyMode ?? null,
          league.auctionBudget ?? null,
          league.formatState ? JSON.stringify(league.formatState) : null,
        ],
      );
      return mapLeague(result.rows[0]!);
    }
  }

  const result = await pool.query(
    `INSERT INTO leagues (
       id, user_id, name, platform, external_id, type, draft_type, team_count, season,
       scoring, roster, draft_slot, strategy_id, sleeper_draft_id, sleeper_user_id,
       dynasty_mode, auction_budget, format_state
     ) VALUES (
       COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, $16, $17, COALESCE($18::jsonb, '{}'::jsonb)
     )
     RETURNING *`,
    [
      league.id || null,
      league.userId,
      league.name,
      league.platform,
      league.externalId ?? null,
      league.type,
      league.draftType,
      league.teamCount,
      league.season,
      JSON.stringify(league.scoring),
      JSON.stringify(league.roster),
      league.draftSlot ?? null,
      league.strategyId ?? null,
      league.sleeperDraftId ?? null,
      league.sleeperUserId ?? null,
      league.dynastyMode ?? null,
      league.auctionBudget ?? null,
      league.formatState ? JSON.stringify(league.formatState) : null,
    ],
  );
  return mapLeague(result.rows[0]!);
}

export async function updateLeagueRow(
  pool: Pool,
  userId: string,
  leagueId: string,
  patch: Partial<League>,
): Promise<League | null> {
  const existing = await getLeagueForUser(pool, userId, leagueId);
  if (!existing) return null;
  const next: League = { ...existing, ...patch, id: existing.id, userId: existing.userId };
  const result = await pool.query(
    `UPDATE leagues SET
       name = $3, strategy_id = $4, draft_slot = $5, sleeper_draft_id = $6,
       dynasty_mode = $7, auction_budget = $8,
       format_state = COALESCE($9::jsonb, format_state)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      leagueId,
      userId,
      next.name,
      next.strategyId ?? null,
      next.draftSlot ?? null,
      next.sleeperDraftId ?? null,
      next.dynastyMode ?? null,
      next.auctionBudget ?? null,
      next.formatState ? JSON.stringify(next.formatState) : null,
    ],
  );
  const row = result.rows[0];
  return row ? mapLeague(row) : null;
}

export async function deleteLeagueRow(
  pool: Pool,
  userId: string,
  leagueId: string,
): Promise<boolean> {
  const result = await pool.query(`DELETE FROM leagues WHERE id = $1 AND user_id = $2`, [
    leagueId,
    userId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function persistLeagueFormatState(
  pool: Pool,
  userId: string,
  leagueId: string,
  formatState: League['formatState'],
): Promise<void> {
  await pool.query(
    `UPDATE leagues SET format_state = $3::jsonb WHERE id = $1 AND user_id = $2`,
    [leagueId, userId, JSON.stringify(formatState ?? {})],
  );
}

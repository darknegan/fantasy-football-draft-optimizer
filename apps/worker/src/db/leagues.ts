import type { League, Platform, RosterShape, ScoringProfile, StrategyId } from '@draftlab/domain';
import type { Db } from './client.js';

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
    draftPlayerPool: (row['draft_player_pool'] as League['draftPlayerPool']) ?? undefined,
    draftRounds: row['draft_rounds'] != null ? Number(row['draft_rounds']) : undefined,
  };
}

function leagueInsert(league: League) {
  return {
    id: league.id || undefined,
    user_id: league.userId,
    name: league.name,
    platform: league.platform,
    external_id: league.externalId ?? null,
    type: league.type,
    draft_type: league.draftType,
    team_count: league.teamCount,
    season: league.season,
    scoring: league.scoring,
    roster: league.roster,
    draft_slot: league.draftSlot ?? null,
    strategy_id: league.strategyId ?? null,
    sleeper_draft_id: league.sleeperDraftId ?? null,
    sleeper_user_id: league.sleeperUserId ?? null,
    dynasty_mode: league.dynastyMode ?? null,
    auction_budget: league.auctionBudget ?? null,
    draft_player_pool: league.draftPlayerPool ?? 'all',
    draft_rounds: league.draftRounds ?? 16,
  };
}

export async function listLeaguesForUser(db: Db, userId: string): Promise<League[]> {
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('leagues')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapLeague(row as Record<string, unknown>));
  }

  const rows = await db.sql`
    SELECT * FROM leagues WHERE user_id = ${userId} ORDER BY created_at ASC
  `;
  return rows.map((row) => mapLeague(row as Record<string, unknown>));
}

export async function getLeagueForUser(
  db: Db,
  userId: string,
  leagueId: string,
): Promise<League | null> {
  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('leagues')
      .select('*')
      .eq('id', leagueId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapLeague(data as Record<string, unknown>) : null;
  }

  const rows = await db.sql`
    SELECT * FROM leagues WHERE id = ${leagueId} AND user_id = ${userId}
  `;
  return rows[0] ? mapLeague(rows[0] as Record<string, unknown>) : null;
}

export async function upsertLeagueRow(db: Db, league: League): Promise<League> {
  if (!league.userId) throw new Error('League.userId is required');

  if (db.kind === 'supabase') {
    if (league.platform === 'sleeper' && league.externalId) {
      const { data: existing, error: findErr } = await db.sb
        .from('leagues')
        .select('id')
        .eq('user_id', league.userId)
        .eq('platform', 'sleeper')
        .eq('external_id', league.externalId)
        .maybeSingle();
      if (findErr) throw new Error(findErr.message);
      if (existing) {
        const { data, error } = await db.sb
          .from('leagues')
          .update(leagueInsert({ ...league, id: String(existing['id']) }))
          .eq('id', String(existing['id']))
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return mapLeague(data as Record<string, unknown>);
      }
    }

    const payload = leagueInsert(league);
    if (!payload.id) delete (payload as { id?: string }).id;
    const { data, error } = await db.sb.from('leagues').insert(payload).select('*').single();
    if (error) throw new Error(error.message);
    return mapLeague(data as Record<string, unknown>);
  }

  const sql = db.sql;
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
          auction_budget = ${league.auctionBudget ?? null},
          draft_player_pool = ${league.draftPlayerPool ?? 'all'},
          draft_rounds = ${league.draftRounds ?? 16}
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
      dynasty_mode, auction_budget, draft_player_pool, draft_rounds
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
      ${league.auctionBudget ?? null},
      ${league.draftPlayerPool ?? 'all'},
      ${league.draftRounds ?? 16}
    )
    RETURNING *
  `;
  return mapLeague(rows[0] as Record<string, unknown>);
}

export async function updateLeagueRow(
  db: Db,
  userId: string,
  leagueId: string,
  patch: Partial<League>,
): Promise<League | null> {
  const existing = await getLeagueForUser(db, userId, leagueId);
  if (!existing) return null;
  const next: League = { ...existing, ...patch, id: existing.id, userId: existing.userId };

  if (db.kind === 'supabase') {
    const { data, error } = await db.sb
      .from('leagues')
      .update({
        name: next.name,
        strategy_id: next.strategyId ?? null,
        draft_slot: next.draftSlot ?? null,
        sleeper_draft_id: next.sleeperDraftId ?? null,
        dynasty_mode: next.dynastyMode ?? null,
        auction_budget: next.auctionBudget ?? null,
      })
      .eq('id', leagueId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapLeague(data as Record<string, unknown>) : null;
  }

  const rows = await db.sql`
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

export async function deleteLeagueRow(
  db: Db,
  userId: string,
  leagueId: string,
): Promise<boolean> {
  if (db.kind === 'supabase') {
    const { error, count } = await db.sb
      .from('leagues')
      .delete({ count: 'exact' })
      .eq('id', leagueId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  }

  const rows = await db.sql`
    DELETE FROM leagues WHERE id = ${leagueId} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

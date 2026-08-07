-- DraftLab Postgres schema (Phase 1 foundations)
-- Engines currently run against in-memory seed data; this schema is the durable target.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  sleeper_id TEXT,
  gsis_id TEXT,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE')),
  age NUMERIC NOT NULL,
  birth_date DATE,
  seasons_in_league INT NOT NULL,
  draft_year INT NOT NULL,
  draft_round INT,
  status TEXT NOT NULL DEFAULT 'active',
  has_positional_top12_finish BOOLEAN NOT NULL DEFAULT FALSE,
  is_clear_wr1 BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_factor_inputs (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season INT NOT NULL,
  factor_id TEXT NOT NULL,
  value DOUBLE PRECISION,
  categorical TEXT,
  PRIMARY KEY (player_id, season, factor_id)
);

CREATE TABLE IF NOT EXISTS player_market (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season INT NOT NULL,
  adp_round_pick TEXT NOT NULL,
  fse_rank DOUBLE PRECISION,
  espn_projection_rank DOUBLE PRECISION,
  PRIMARY KEY (player_id, season)
);

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('sleeper', 'manual')),
  external_id TEXT,
  type TEXT NOT NULL,
  draft_type TEXT NOT NULL,
  team_count INT NOT NULL,
  season INT NOT NULL,
  scoring JSONB NOT NULL,
  roster JSONB NOT NULL,
  draft_slot INT,
  strategy_id TEXT,
  sleeper_draft_id TEXT,
  sleeper_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS draft_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  pick_number INT NOT NULL,
  round INT NOT NULL,
  slot INT NOT NULL,
  player_id TEXT REFERENCES players(id),
  roster_id TEXT NOT NULL,
  picked_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('sleeper', 'manual')),
  UNIQUE (league_id, pick_number)
);

CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_draft_picks_league ON draft_picks(league_id);

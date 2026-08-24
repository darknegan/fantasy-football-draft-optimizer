-- Dynasty rookie draft pool + round count (Sleeper player_type / rounds).
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS draft_player_pool TEXT NOT NULL DEFAULT 'all'
    CHECK (draft_player_pool IN ('all', 'rookies'));

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS draft_rounds INT NOT NULL DEFAULT 16;

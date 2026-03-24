-- Mariners Watch — Supabase Schema
-- Run this in the Supabase SQL Editor before running ingest.js

CREATE TABLE IF NOT EXISTS games (
  -- Identity
  game_pk       BIGINT    NOT NULL,          -- MLB's gamePk (unique per game)
  team_id       INT       NOT NULL,          -- Which team this row represents

  -- When / what kind
  season        SMALLINT  NOT NULL,
  game_date     DATE      NOT NULL,
  game_type     CHAR(1)   NOT NULL DEFAULT 'R', -- R=regular, F=wild card, D=division, L=LCS, W=world series

  -- Game context
  is_home       BOOLEAN   NOT NULL,
  opp_team_id   INT       NOT NULL,
  opp_abbr      TEXT      NOT NULL,

  -- Cumulative record at end of this game (regular season only; null for postseason)
  wins          SMALLINT,
  losses        SMALLINT,

  -- Score
  score         SMALLINT,
  opp_score     SMALLINT,
  result        CHAR(1),                     -- 'W' or 'L'

  PRIMARY KEY (game_pk, team_id)
);

-- Index used by the app's two main queries:
--   1. SELECT * FROM games WHERE season = $1 AND team_id = $2  (standings chart)
--   2. SELECT * FROM games WHERE season = $1 AND team_id = 136 (Mariners game card)
CREATE INDEX IF NOT EXISTS idx_games_season_team
  ON games (season, team_id, game_date);

-- Enable Row Level Security — public reads, service-role-only writes
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read"
  ON games FOR SELECT
  USING (true);

-- Writes are handled by the ingestion script using the service role key,
-- which bypasses RLS automatically — no write policy needed.

-- Migration 0003: Instagram media, insights, and sync runs schema.
-- Schema only. This migration inserts no rows.

-- Add profile picture URL to connected_accounts if missing
ALTER TABLE connected_accounts ADD COLUMN profile_picture_url TEXT;

CREATE TABLE instagram_media (
  id                    TEXT    PRIMARY KEY NOT NULL,
  connected_account_id  TEXT    NOT NULL REFERENCES connected_accounts (id) ON DELETE CASCADE,
  provider_media_id     TEXT    NOT NULL,
  media_type            TEXT,
  media_product_type    TEXT,
  caption               TEXT,
  permalink             TEXT,
  media_url             TEXT,
  thumbnail_url         TEXT,
  timestamp             TEXT,
  like_count            INTEGER,
  comments_count        INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE UNIQUE INDEX instagram_media_account_provider_unique ON instagram_media (connected_account_id, provider_media_id);
CREATE INDEX instagram_media_connected_account_id_idx ON instagram_media (connected_account_id);

CREATE TABLE instagram_insights (
  id                   TEXT    PRIMARY KEY NOT NULL,
  connected_account_id TEXT    NOT NULL REFERENCES connected_accounts (id) ON DELETE CASCADE,
  metric_name          TEXT    NOT NULL,
  metric_value         REAL    NOT NULL,
  period               TEXT,
  metric_date          TEXT,
  provider_source      TEXT    NOT NULL,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE UNIQUE INDEX instagram_insights_unique ON instagram_insights (connected_account_id, metric_name, period, metric_date);
CREATE INDEX instagram_insights_connected_account_id_idx ON instagram_insights (connected_account_id);

CREATE TABLE instagram_sync_runs (
  id                   TEXT    PRIMARY KEY NOT NULL,
  connected_account_id TEXT    NOT NULL REFERENCES connected_accounts (id) ON DELETE CASCADE,
  status               TEXT    NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at           INTEGER NOT NULL,
  completed_at         INTEGER,
  items_fetched        INTEGER DEFAULT 0,
  error_code           TEXT,
  error_message        TEXT,
  created_at           INTEGER NOT NULL
);

CREATE INDEX instagram_sync_runs_account_started_idx ON instagram_sync_runs (connected_account_id, started_at DESC);

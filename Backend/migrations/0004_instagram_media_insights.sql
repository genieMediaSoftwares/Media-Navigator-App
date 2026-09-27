-- Migration 0004: per-media Instagram insights.
-- Schema only. This migration inserts no rows.
--
-- Values come from the Meta media insights edge (/{media-id}/insights) during sync.
-- NULL means Meta did not return the metric for that media item (unsupported media type,
-- missing permission, media published before the account became a Business/Creator account).
-- NULL must never be read as zero.

ALTER TABLE instagram_media ADD COLUMN views INTEGER;
ALTER TABLE instagram_media ADD COLUMN reach INTEGER;
ALTER TABLE instagram_media ADD COLUMN saved INTEGER;
ALTER TABLE instagram_media ADD COLUMN shares INTEGER;
ALTER TABLE instagram_media ADD COLUMN total_interactions INTEGER;
-- Epoch ms of the last sync that successfully returned insights for this item; NULL = never.
ALTER TABLE instagram_media ADD COLUMN insights_synced_at INTEGER;

CREATE INDEX instagram_media_account_timestamp_idx ON instagram_media (connected_account_id, timestamp DESC);

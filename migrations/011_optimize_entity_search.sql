-- Optimize entity search queries:
--   1. pg_trgm index on label + entity_name  →  LIKE '%keyword%' can use GIN scan
--   2. Covering index on (confidence, entity_type, entity_name) → ORDER BY avoids sort
--   3. Covering index on (chain, entity_type, confidence)       → chain + type filter + sort
--
-- pg_trgm requires the pg_trgm extension (usually pre-installed on managed Postgres).
-- Run with: psql "$DATABASE_URL" -f migrations/011_optimize_entity_search.sql

-- ── 1. Enable trigram support ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. Fuzzy-search index on label (covers label LIKE '%foo%') ─────────────────
--    Also speeds up entity_name since query is OR label OR entity_name.
--    Btree ops on label is kept for exact-prefix searches (label LIKE 'foo%').
CREATE INDEX IF NOT EXISTS entities_label_trgm_idx
  ON entities USING gin (label gin_trgm_ops);

-- Separate trigram index on entity_name as a fallback for pure entity_name searches
CREATE INDEX IF NOT EXISTS entities_entity_name_trgm_idx
  ON entities USING gin (entity_name gin_trgm_ops);

-- ── 3. Composite sort index for ORDER BY confidence DESC, entity_type, entity_name
--    PostgreSQL can scan this index backwards to satisfy the sort without a separate
--    sort step, even when not all columns are filtered.
CREATE INDEX IF NOT EXISTS entities_conf_sort_idx
  ON entities (confidence DESC, entity_type, entity_name);

-- ── 4. Composite index for chain + type + sort
--    Handles the common filter: chain=X AND entity_type=Y ORDER BY confidence
CREATE INDEX IF NOT EXISTS entities_chain_type_conf_idx
  ON entities (chain, entity_type, confidence DESC);

-- Verify: run EXPLAIN ANALYZE on the search query after deploying.
-- Example:
--   EXPLAIN ANALYZE
--   SELECT * FROM entities
--   WHERE (LOWER(label) LIKE '%binance%' OR LOWER(entity_name) LIKE '%binance%')
--     AND entity_type = 'exchange'
--     AND chain = 'ethereum'
--   ORDER BY confidence DESC, entity_type, entity_name
--   LIMIT 20 OFFSET 0;

-- Phase 0 baseline: extensions used across the schema.
--   postgis     -> geography(Point) columns for "near me" search (Phase 4)
--   btree_gist  -> exclusion constraint that prevents double-booking (Phase 6)
--   citext      -> case-insensitive emails (Phase 1a)
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "citext";

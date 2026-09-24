-- Runs once when the Postgres volume is first created.
-- Extensions are also created by the first Prisma migration, so this is only
-- here to make a fresh local DB and the test DB behave the same.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;

-- Separate database for e2e tests.
CREATE DATABASE sajha_test;
\connect sajha_test
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;

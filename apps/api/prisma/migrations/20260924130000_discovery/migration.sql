-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "search_vector" tsvector;

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","listing_id")
);

-- CreateTable
CREATE TABLE "listing_views" (
    "listing_id" UUID NOT NULL,
    "viewer_key" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "listing_views_pkey" PRIMARY KEY ("listing_id","viewer_key","day")
);

-- CreateIndex
CREATE INDEX "favorites_listing_id_created_at_idx" ON "favorites"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_views_day_listing_id_idx" ON "listing_views"("day", "listing_id");

-- CreateIndex
CREATE INDEX "listings_search_vector_gin" ON "listings" USING GIN ("search_vector");

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Custom SQL (not expressible in the Prisma schema) ────────────────────────

-- One trigger keeps every derived column in sync: the geography point (Phase 3)
-- and the full-text vector. Title weighs most, then brand and category, then
-- the description. The 'english' configuration stems ("tents" finds "tent").
DROP TRIGGER "listings_sync_location" ON "listings";
DROP FUNCTION listings_sync_location();

CREATE FUNCTION listings_sync_derived() RETURNS trigger AS $$
DECLARE
  category_name text;
BEGIN
  NEW."location" := CASE
    WHEN NEW."lat" IS NOT NULL AND NEW."lng" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(NEW."lng", NEW."lat"), 4326)::geography
  END;
  SELECT "name" INTO category_name FROM "categories" WHERE "id" = NEW."category_id";
  NEW."search_vector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."brand", '') || ' ' || coalesce(category_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."description", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "listings_sync_derived"
  BEFORE INSERT OR UPDATE OF "lat", "lng", "location", "title", "brand", "description", "category_id", "search_vector"
  ON "listings"
  FOR EACH ROW EXECUTE FUNCTION listings_sync_derived();

-- Renaming a category re-indexes its listings.
CREATE FUNCTION categories_refresh_listing_search() RETURNS trigger AS $$
BEGIN
  UPDATE "listings" SET "search_vector" = NULL WHERE "category_id" = NEW."id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "categories_refresh_listing_search"
  AFTER UPDATE OF "name" ON "categories"
  FOR EACH ROW WHEN (OLD."name" IS DISTINCT FROM NEW."name")
  EXECUTE FUNCTION categories_refresh_listing_search();

-- Backfill existing listings (the trigger computes the vector).
UPDATE "listings" SET "search_vector" = NULL;

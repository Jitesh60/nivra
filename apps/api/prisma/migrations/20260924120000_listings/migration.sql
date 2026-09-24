-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING', 'LIVE', 'PAUSED', 'REJECTED', 'REMOVED', 'DELETED');

-- CreateEnum
CREATE TYPE "RequiredDocType" AS ENUM ('GOVERNMENT_ID', 'COLLEGE_OR_EMPLOYEE_ID', 'ADDRESS_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "BlockReason" AS ENUM ('OWNER_BLOCK');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "lender_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "condition" "ItemCondition" NOT NULL,
    "brand" TEXT,
    "size" TEXT,
    "price_per_day_paise" INTEGER NOT NULL,
    "weekly_discount_pct" INTEGER NOT NULL DEFAULT 0,
    "deposit_paise" INTEGER NOT NULL,
    "min_days" INTEGER NOT NULL DEFAULT 1,
    "max_days" INTEGER NOT NULL DEFAULT 30,
    "advance_notice_days" INTEGER NOT NULL DEFAULT 1,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "location" geography,
    "area_label" TEXT,
    "exact_address_enc" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "rejection_reason" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_photos" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "thumb_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_required_docs" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "doc_type" "RequiredDocType" NOT NULL,
    "note" TEXT,

    CONSTRAINT "listing_required_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_blocks" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "reason" "BlockReason" NOT NULL DEFAULT 'OWNER_BLOCK',

    CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_sort_order_idx" ON "categories"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "listings_lender_id_idx" ON "listings"("lender_id");

-- CreateIndex
CREATE INDEX "listings_status_created_at_idx" ON "listings"("status", "created_at");

-- CreateIndex
CREATE INDEX "listings_category_id_status_idx" ON "listings"("category_id", "status");

-- CreateIndex
CREATE INDEX "listings_location_gist" ON "listings" USING GIST ("location");

-- CreateIndex
CREATE INDEX "listing_photos_listing_id_sort_order_idx" ON "listing_photos"("listing_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "listing_required_docs_listing_id_doc_type_key" ON "listing_required_docs"("listing_id", "doc_type");

-- CreateIndex
CREATE INDEX "availability_blocks_listing_id_starts_on_idx" ON "availability_blocks"("listing_id", "starts_on");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_required_docs" ADD CONSTRAINT "listing_required_docs_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Custom SQL (not expressible in the Prisma schema) ────────────────────────

-- "location" follows lat/lng on every write, so the app never writes it.
CREATE FUNCTION listings_sync_location() RETURNS trigger AS $$
BEGIN
  NEW."location" := CASE
    WHEN NEW."lat" IS NOT NULL AND NEW."lng" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(NEW."lng", NEW."lat"), 4326)::geography
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "listings_sync_location"
  BEFORE INSERT OR UPDATE OF "lat", "lng", "location" ON "listings"
  FOR EACH ROW EXECUTE FUNCTION listings_sync_location();

ALTER TABLE "listings"
  ADD CONSTRAINT "listings_price_range" CHECK ("price_per_day_paise" BETWEEN 1000 AND 1000000),
  ADD CONSTRAINT "listings_deposit_range" CHECK ("deposit_paise" BETWEEN 0 AND 5000000),
  ADD CONSTRAINT "listings_weekly_discount_range" CHECK ("weekly_discount_pct" BETWEEN 0 AND 50),
  ADD CONSTRAINT "listings_days_range" CHECK ("min_days" >= 1 AND "max_days" <= 90 AND "min_days" <= "max_days"),
  ADD CONSTRAINT "listings_advance_notice_range" CHECK ("advance_notice_days" BETWEEN 0 AND 7),
  ADD CONSTRAINT "listings_lat_range" CHECK ("lat" IS NULL OR "lat" BETWEEN -90 AND 90),
  ADD CONSTRAINT "listings_lng_range" CHECK ("lng" IS NULL OR "lng" BETWEEN -180 AND 180),
  ADD CONSTRAINT "listings_lat_lng_together" CHECK (("lat" IS NULL) = ("lng" IS NULL));

ALTER TABLE "listing_required_docs"
  ADD CONSTRAINT "listing_required_docs_other_has_note" CHECK ("doc_type" <> 'OTHER' OR "note" IS NOT NULL);

ALTER TABLE "availability_blocks"
  ADD CONSTRAINT "availability_blocks_ordered" CHECK ("starts_on" <= "ends_on");

-- Launch categories (PRD §4). Admins manage them from the admin panel afterwards.
INSERT INTO "categories" ("id", "name", "slug", "icon", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'Trekking & outdoor gear', 'trekking-outdoor', 'hiking', 10, now()),
  (gen_random_uuid(), 'Cameras & electronics', 'cameras-electronics', 'photo_camera', 20, now()),
  (gen_random_uuid(), 'Tools & DIY', 'tools-diy', 'handyman', 30, now()),
  (gen_random_uuid(), 'Sports & fitness', 'sports-fitness', 'sports_tennis', 40, now()),
  (gen_random_uuid(), 'Party & event items', 'party-events', 'celebration', 50, now()),
  (gen_random_uuid(), 'Travel bags & luggage', 'travel-luggage', 'luggage', 60, now()),
  (gen_random_uuid(), 'Books & study material', 'books-study', 'menu_book', 70, now()),
  (gen_random_uuid(), 'Baby & kids gear', 'baby-kids', 'child_friendly', 80, now()),
  (gen_random_uuid(), 'Costumes & ethnic wear', 'costumes-ethnic', 'checkroom', 90, now());

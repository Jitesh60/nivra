-- Phase 10: saved searches, the requests board, referrals and credit.
-- CreateEnum
CREATE TYPE "ItemRequestStatus" AS ENUM ('OPEN', 'CLOSED', 'EXPIRED', 'REMOVED');

-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('GRANT_REFEREE', 'GRANT_REFERRER', 'HOLD', 'RELEASE', 'REVOKE');

-- AlterEnum
ALTER TYPE "LedgerAccount" ADD VALUE 'PROMOTIONS';

-- AlterEnum
ALTER TYPE "ReportTarget" ADD VALUE 'REQUEST';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "credit_paise" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "push_requests" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "push_search_alerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "category_id" UUID,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radius_km" INTEGER NOT NULL,
    "location" geography,
    "alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_pushed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_requests" (
    "id" UUID NOT NULL,
    "borrower_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "category_id" UUID,
    "start_date" DATE,
    "end_date" DATE,
    "budget_per_day_paise" INTEGER,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "location" geography,
    "area_label" TEXT NOT NULL,
    "status" "ItemRequestStatus" NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "removed_reason" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_responses" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "lender_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "referee_id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "rewarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("referee_id")
);

-- CreateTable
CREATE TABLE "credit_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "kind" "CreditKind" NOT NULL,
    "booking_id" UUID,
    "referral_id" UUID,
    "admin_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_searches_user_id_created_at_idx" ON "saved_searches"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "saved_searches_location_gist" ON "saved_searches" USING GIST ("location");

-- CreateIndex
CREATE INDEX "item_requests_borrower_id_created_at_idx" ON "item_requests"("borrower_id", "created_at");

-- CreateIndex
CREATE INDEX "item_requests_status_expires_at_idx" ON "item_requests"("status", "expires_at");

-- CreateIndex
CREATE INDEX "item_requests_location_gist" ON "item_requests" USING GIST ("location");

-- CreateIndex
CREATE INDEX "request_responses_lender_id_created_at_idx" ON "request_responses"("lender_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "request_responses_request_id_listing_id_key" ON "request_responses"("request_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_created_at_idx" ON "referrals"("referrer_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_entries_user_id_created_at_idx" ON "credit_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_entries_booking_id_idx" ON "credit_entries"("booking_id");

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_responses" ADD CONSTRAINT "request_responses_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "item_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_responses" ADD CONSTRAINT "request_responses_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_responses" ADD CONSTRAINT "request_responses_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_responses" ADD CONSTRAINT "request_responses_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("referee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ─── Custom SQL (not expressible in the Prisma schema) ────────────────────────

-- "location" follows lat/lng on every write (like listings), so the app never writes it.
CREATE FUNCTION sync_point_location() RETURNS trigger AS $$
BEGIN
  NEW."location" := ST_SetSRID(ST_MakePoint(NEW."lng", NEW."lat"), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "saved_searches_sync_location"
  BEFORE INSERT OR UPDATE OF "lat", "lng", "location" ON "saved_searches"
  FOR EACH ROW EXECUTE FUNCTION sync_point_location();

CREATE TRIGGER "item_requests_sync_location"
  BEFORE INSERT OR UPDATE OF "lat", "lng", "location" ON "item_requests"
  FOR EACH ROW EXECUTE FUNCTION sync_point_location();

-- The board only ever lists open requests.
CREATE INDEX "item_requests_open_location_gist" ON "item_requests" USING GIST ("location") WHERE "status" = 'OPEN';

-- The total now takes the referral credit off; credit is never more than the rent.
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_amounts_check";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_amounts_check" CHECK (
    "days" > 0 AND "price_per_day_paise" > 0 AND "rent_paise" >= 0 AND "fee_paise" >= 0
    AND "deposit_paise" >= 0 AND "credit_paise" >= 0 AND "credit_paise" <= "rent_paise"
    AND "total_paise" = "rent_paise" + "fee_paise" + "deposit_paise" - "credit_paise"
  );
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_amount_nonzero" CHECK ("amount_paise" <> 0);

-- A booking holds credit at most once.
CREATE UNIQUE INDEX "credit_entries_one_hold_per_booking" ON "credit_entries" ("booking_id") WHERE "kind" = 'HOLD';
-- …and gives it back at most once.
CREATE UNIQUE INDEX "credit_entries_one_release_per_booking" ON "credit_entries" ("booking_id") WHERE "kind" = 'RELEASE';

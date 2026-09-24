-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'AWAITING_DOCS', 'AWAITING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'RETURNED', 'COMPLETED', 'DISPUTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('REQUEST', 'OFFER');

-- CreateEnum
CREATE TYPE "BookingParty" AS ENUM ('BORROWER', 'LENDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "BookingEventType" AS ENUM ('REQUESTED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'DOCS_SUBMITTED', 'DOCS_APPROVED', 'DOCS_REJECTED');

-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "borrower_id" UUID NOT NULL,
    "lender_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "offer_id" UUID,
    "source" "BookingSource" NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "price_per_day_paise" INTEGER NOT NULL,
    "rent_paise" INTEGER NOT NULL,
    "fee_paise" INTEGER NOT NULL,
    "deposit_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "expires_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "cancelled_by_id" UUID,
    "cancelled_by" "BookingParty",
    "cancel_reason" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "type" "BookingEventType" NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_document_shares" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "required_doc_id" UUID,
    "user_document_id" UUID,
    "doc_type" "DocumentType" NOT NULL,
    "label" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "front_key" TEXT,
    "back_key" TEXT,
    "status" "ShareStatus" NOT NULL DEFAULT 'SUBMITTED',
    "access_expires_at" TIMESTAMP(3),
    "purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_document_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_logs" (
    "id" UUID NOT NULL,
    "share_id" UUID NOT NULL,
    "viewer_id" UUID NOT NULL,
    "viewer_type" "ActorType" NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_offer_id_key" ON "bookings"("offer_id");

-- CreateIndex
CREATE INDEX "bookings_borrower_id_created_at_idx" ON "bookings"("borrower_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_lender_id_created_at_idx" ON "bookings"("lender_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_listing_id_status_idx" ON "bookings"("listing_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_expires_at_idx" ON "bookings"("status", "expires_at");

-- CreateIndex
CREATE INDEX "booking_events_booking_id_created_at_idx" ON "booking_events"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "booking_document_shares_booking_id_idx" ON "booking_document_shares"("booking_id");

-- CreateIndex
CREATE INDEX "booking_document_shares_access_expires_at_purged_at_idx" ON "booking_document_shares"("access_expires_at", "purged_at");

-- CreateIndex
CREATE INDEX "document_access_logs_share_id_created_at_idx" ON "document_access_logs"("share_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_id_idx" ON "notifications"("user_id", "id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_document_shares" ADD CONSTRAINT "booking_document_shares_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_document_shares" ADD CONSTRAINT "booking_document_shares_required_doc_id_fkey" FOREIGN KEY ("required_doc_id") REFERENCES "listing_required_docs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_document_shares" ADD CONSTRAINT "booking_document_shares_user_document_id_fkey" FOREIGN KEY ("user_document_id") REFERENCES "user_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "booking_document_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─── Hand-written: rules Prisma can't express ────────────────────────────────

-- The double-booking guard (docs/ARCHITECTURE.md §3.5): from AWAITING_PAYMENT on,
-- no two bookings of a listing may share a day.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("listing_id" WITH =, daterange("starts_on", "ends_on", '[]') WITH &&)
  WHERE ("status" IN ('AWAITING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'RETURNED', 'DISPUTED'));

-- One open booking per borrower and listing.
CREATE UNIQUE INDEX "bookings_one_open" ON "bookings" ("listing_id", "borrower_id")
  WHERE "status" IN ('REQUESTED', 'AWAITING_DOCS', 'AWAITING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'RETURNED', 'DISPUTED');

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_dates_check" CHECK ("ends_on" >= "starts_on"),
  ADD CONSTRAINT "bookings_parties_check" CHECK ("borrower_id" <> "lender_id"),
  ADD CONSTRAINT "bookings_amounts_check" CHECK (
    "days" > 0 AND "price_per_day_paise" > 0 AND "rent_paise" >= 0 AND "fee_paise" >= 0
    AND "deposit_paise" >= 0 AND "total_paise" = "rent_paise" + "fee_paise" + "deposit_paise"
  );

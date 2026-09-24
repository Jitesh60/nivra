-- CreateEnum
CREATE TYPE "RentalStage" AS ENUM ('HANDOVER', 'RETURN');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('DAMAGE', 'MISSING_PARTS', 'NOT_RETURNED', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingEventType" ADD VALUE 'HANDED_OVER';
ALTER TYPE "BookingEventType" ADD VALUE 'RETURNED';
ALTER TYPE "BookingEventType" ADD VALUE 'NO_SHOW';
ALTER TYPE "BookingEventType" ADD VALUE 'DISPUTED';
ALTER TYPE "BookingEventType" ADD VALUE 'COMPLETED';
ALTER TYPE "BookingEventType" ADD VALUE 'DISPUTE_RESOLVED';

-- AlterEnum
ALTER TYPE "RefundKind" ADD VALUE 'DEPOSIT_RETURN';

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "rating_avg" DOUBLE PRECISION,
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "rating_avg" DOUBLE PRECISION,
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "transfers" ADD COLUMN     "from_deposit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "handed_over_at" TIMESTAMP(3),
ADD COLUMN     "kept_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "late_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "late_fee_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "no_show_at" TIMESTAMP(3),
ADD COLUMN     "returned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "condition_reports" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "stage" "RentalStage" NOT NULL,
    "by_user_id" UUID NOT NULL,
    "photo_keys" TEXT[],
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condition_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "claim_paise" INTEGER NOT NULL,
    "evidence_keys" TEXT[],
    "response_note" TEXT,
    "response_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responded_at" TIMESTAMP(3),
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "kept_paise" INTEGER,
    "resolution_note" TEXT,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "author_role" "BookingParty" NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "condition_reports_booking_id_stage_by_user_id_key" ON "condition_reports"("booking_id", "stage", "by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_booking_id_key" ON "disputes"("booking_id");

-- CreateIndex
CREATE INDEX "disputes_status_created_at_idx" ON "disputes"("status", "created_at");

-- CreateIndex
CREATE INDEX "reviews_subject_id_published_at_idx" ON "reviews"("subject_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_author_id_key" ON "reviews"("booking_id", "author_id");

-- AddForeignKey
ALTER TABLE "condition_reports" ADD CONSTRAINT "condition_reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_reports" ADD CONSTRAINT "condition_reports_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Hand-written ──

-- Ratings are 1–5 stars; money is never negative.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_amounts_check"
  CHECK ("claim_paise" >= 0 AND ("kept_paise" IS NULL OR "kept_paise" >= 0));
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rental_amounts_check"
  CHECK ("late_days" >= 0 AND "late_fee_paise" >= 0 AND "kept_paise" >= 0
    AND "late_fee_paise" <= "deposit_paise" AND "kept_paise" <= "deposit_paise");
-- Condition photos: at most 6 per person per stage (evidence the same).
ALTER TABLE "condition_reports" ADD CONSTRAINT "condition_reports_photos_check"
  CHECK (cardinality("photo_keys") BETWEEN 1 AND 6);
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_evidence_check"
  CHECK (cardinality("evidence_keys") <= 6 AND cardinality("response_keys") <= 6);
-- One transfer of kept deposit per booking (settlement is retried, never doubled).
CREATE UNIQUE INDEX "transfers_one_from_deposit" ON "transfers" ("booking_id") WHERE "from_deposit";
-- Reviews to publish (the sweep).
CREATE INDEX "reviews_unpublished_idx" ON "reviews" ("created_at") WHERE "published_at" IS NULL;

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'CAPTURED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RefundKind" AS ENUM ('CANCELLATION', 'LATE_PAYMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutAccountStatus" AS ENUM ('PENDING', 'NEEDS_CLARIFICATION', 'ACTIVATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('AWAITING_ACCOUNT', 'ON_HOLD', 'RELEASED', 'REVERSED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('GATEWAY', 'DEPOSIT_HELD', 'LENDER_PAYABLE', 'PLATFORM_REVENUE', 'GOODWILL');

-- AlterEnum
ALTER TYPE "BookingEventType" ADD VALUE 'PAID';

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "method" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "failure_reason" TEXT,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider_refund_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "breakdown" JSONB,
    "kind" "RefundKind" NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider_account_id" TEXT,
    "status" "PayoutAccountStatus" NOT NULL DEFAULT 'PENDING',
    "status_reason" TEXT,
    "beneficiary_name" TEXT NOT NULL,
    "bank_last4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "pan_last4" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "lender_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "provider_transfer_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "on_hold" BOOLEAN NOT NULL DEFAULT true,
    "status" "TransferStatus" NOT NULL,
    "failure_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "txn_id" UUID NOT NULL,
    "booking_id" UUID,
    "type" TEXT NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "debit_paise" INTEGER NOT NULL DEFAULT 0,
    "credit_paise" INTEGER NOT NULL DEFAULT 0,
    "external_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_id_key" ON "payments"("payment_id");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refunds_booking_id_idx" ON "refunds"("booking_id");

-- CreateIndex
CREATE INDEX "refunds_status_created_at_idx" ON "refunds"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_accounts_user_id_key" ON "payout_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_accounts_provider_account_id_key" ON "payout_accounts"("provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_provider_transfer_id_key" ON "transfers"("provider_transfer_id");

-- CreateIndex
CREATE INDEX "transfers_booking_id_idx" ON "transfers"("booking_id");

-- CreateIndex
CREATE INDEX "transfers_lender_id_status_idx" ON "transfers"("lender_id", "status");

-- CreateIndex
CREATE INDEX "transfers_status_created_at_idx" ON "transfers"("status", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_txn_id_idx" ON "ledger_entries"("txn_id");

-- CreateIndex
CREATE INDEX "ledger_entries_booking_id_idx" ON "ledger_entries"("booking_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries"("account");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─── Hand-written: rules Prisma can't express ────────────────────────────────

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount_paise" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_check" CHECK ("amount_paise" > 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_amount_check" CHECK ("amount_paise" > 0);

-- A ledger line is a debit or a credit, never both, never negative.
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_check" CHECK (
  "debit_paise" >= 0 AND "credit_paise" >= 0 AND ("debit_paise" = 0) <> ("credit_paise" = 0)
);

-- One live transfer per booking and payment (a reversal ends it; a kept share after
-- a cancellation is a separate, not-held transfer).
CREATE UNIQUE INDEX "transfers_one_live_hold" ON "transfers" ("booking_id")
  WHERE "status" IN ('AWAITING_ACCOUNT', 'ON_HOLD') AND "on_hold";

-- Every ledger transaction balances: checked when the database transaction commits,
-- so all of its lines can be inserted first.
CREATE FUNCTION ledger_txn_balanced() RETURNS trigger AS $$
DECLARE
  diff bigint;
BEGIN
  SELECT COALESCE(SUM("debit_paise"), 0) - COALESCE(SUM("credit_paise"), 0) INTO diff
  FROM "ledger_entries" WHERE "txn_id" = NEW."txn_id";
  IF diff <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced by %', NEW."txn_id", diff
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ledger_entries_balanced"
  AFTER INSERT OR UPDATE ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_txn_balanced();

-- The ledger is append-only.
CREATE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries can''t be changed or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

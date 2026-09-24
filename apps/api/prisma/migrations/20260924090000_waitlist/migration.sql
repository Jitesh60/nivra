-- CreateEnum
CREATE TYPE "WaitlistRole" AS ENUM ('BORROWER', 'LENDER', 'BOTH');

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "city" TEXT,
    "role" "WaitlistRole",
    "source" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");


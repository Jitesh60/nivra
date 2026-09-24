-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('AADHAAR_MASKED', 'PAN', 'DRIVING_LICENCE', 'PASSPORT', 'VOTER_ID', 'COLLEGE_ID', 'EMPLOYEE_ID', 'ADDRESS_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "city" TEXT,
    "bio" TEXT,
    "avatar_key" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_documents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "label" TEXT,
    "front_key" TEXT NOT NULL,
    "back_key" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "expires_on" DATE,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_documents_user_id_idx" ON "user_documents"("user_id");

-- CreateIndex
CREATE INDEX "user_documents_status_created_at_idx" ON "user_documents"("status", "created_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one live document of each type per user. Rejected or deleted ones
-- don't count, so a user can re-upload after a rejection.
CREATE UNIQUE INDEX "user_documents_one_live_per_type"
  ON "user_documents" ("user_id", "type")
  WHERE "deleted_at" IS NULL AND "status" IN ('PENDING', 'APPROVED');

-- OTHER documents need a label.
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_other_has_label"
  CHECK ("type" <> 'OTHER' OR "label" IS NOT NULL);

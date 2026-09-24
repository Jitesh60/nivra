-- Phase 9: notification preferences, and a partial index for unread counts.
-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "push_bookings" BOOLEAN NOT NULL DEFAULT true,
    "push_chat" BOOLEAN NOT NULL DEFAULT true,
    "push_reminders" BOOLEAN NOT NULL DEFAULT true,
    "email_bookings" BOOLEAN NOT NULL DEFAULT true,
    "sms_reminders" BOOLEAN NOT NULL DEFAULT true,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Unread badge counts (GET /v1/me/unread, the bell) only look at unread rows.
CREATE INDEX "notifications_unread_idx" ON "notifications" ("user_id") WHERE "read_at" IS NULL;

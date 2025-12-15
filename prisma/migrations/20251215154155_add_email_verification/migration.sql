-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "domain_email_verified" BOOLEAN DEFAULT false,
ADD COLUMN     "domain_email_verify_details" JSONB,
ADD COLUMN     "domain_email_verify_status" TEXT,
ADD COLUMN     "serp_email_verified" BOOLEAN DEFAULT false,
ADD COLUMN     "serp_email_verify_details" JSONB,
ADD COLUMN     "serp_email_verify_status" TEXT;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "emails_verified" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verification_time" INTEGER;

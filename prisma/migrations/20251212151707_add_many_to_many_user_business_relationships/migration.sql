-- CreateTable: UserBusiness junction table
CREATE TABLE "user_businesses" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "job_id" TEXT,

    CONSTRAINT "user_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable: JobBusiness junction table
CREATE TABLE "job_businesses" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "was_reused" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "job_businesses_pkey" PRIMARY KEY ("id")
);

-- Migrate existing data from Business.jobId to junction tables
-- This creates UserBusiness and JobBusiness records for all existing businesses
INSERT INTO "job_businesses" ("id", "created_at", "job_id", "business_id", "was_reused")
SELECT
    gen_random_uuid()::text,
    NOW(),
    b.job_id,
    b.id,
    false
FROM "businesses" b
WHERE b.job_id IS NOT NULL;

INSERT INTO "user_businesses" ("id", "created_at", "user_id", "business_id", "job_id")
SELECT
    gen_random_uuid()::text,
    NOW(),
    j.user_id,
    b.id,
    b.job_id
FROM "businesses" b
INNER JOIN "jobs" j ON b.job_id = j.id
WHERE b.job_id IS NOT NULL;

-- DropForeignKey: Remove old Business -> Job foreign key
ALTER TABLE "businesses" DROP CONSTRAINT IF EXISTS "businesses_job_id_fkey";

-- DropIndex: Remove old jobId index
DROP INDEX IF EXISTS "businesses_job_id_idx";

-- AlterTable: Remove jobId column from businesses
ALTER TABLE "businesses" DROP COLUMN "job_id";

-- CreateIndex: Add indexes for junction tables
CREATE UNIQUE INDEX "user_businesses_user_id_business_id_key" ON "user_businesses"("user_id", "business_id");

CREATE INDEX "user_businesses_user_id_idx" ON "user_businesses"("user_id");

CREATE INDEX "user_businesses_business_id_idx" ON "user_businesses"("business_id");

CREATE INDEX "user_businesses_job_id_idx" ON "user_businesses"("job_id");

CREATE UNIQUE INDEX "job_businesses_job_id_business_id_key" ON "job_businesses"("job_id", "business_id");

CREATE INDEX "job_businesses_job_id_idx" ON "job_businesses"("job_id");

CREATE INDEX "job_businesses_business_id_idx" ON "job_businesses"("business_id");

-- AddForeignKey: Add foreign keys for junction tables
ALTER TABLE "user_businesses" ADD CONSTRAINT "user_businesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_businesses" ADD CONSTRAINT "user_businesses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_businesses" ADD CONSTRAINT "job_businesses_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_businesses" ADD CONSTRAINT "job_businesses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

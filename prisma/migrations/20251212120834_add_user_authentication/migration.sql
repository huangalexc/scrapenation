-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserTier" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "place_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formatted_address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "rating" DOUBLE PRECISION,
    "user_ratings_total" INTEGER,
    "price_level" INTEGER,
    "types" TEXT[],
    "business_type" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "serp_domain" TEXT,
    "serp_domain_confidence" DOUBLE PRECISION,
    "serp_email" TEXT,
    "serp_email_confidence" DOUBLE PRECISION,
    "serp_phone" TEXT,
    "serp_phone_confidence" DOUBLE PRECISION,
    "domain_email" TEXT,
    "domain_phone" TEXT,
    "scrape_error" TEXT,
    "job_id" TEXT,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "business_type" TEXT NOT NULL,
    "geography" TEXT[],
    "zip_percentage" INTEGER NOT NULL DEFAULT 30,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "total_zips" INTEGER NOT NULL DEFAULT 0,
    "zips_processed" INTEGER NOT NULL DEFAULT 0,
    "businesses_found" INTEGER NOT NULL DEFAULT 0,
    "businesses_enriched" INTEGER NOT NULL DEFAULT 0,
    "businesses_scraped" INTEGER NOT NULL DEFAULT 0,
    "errors_encountered" INTEGER NOT NULL DEFAULT 0,
    "places_api_calls" INTEGER NOT NULL DEFAULT 0,
    "custom_search_calls" INTEGER NOT NULL DEFAULT 0,
    "openai_calls" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error_log" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "tier" "UserTier" NOT NULL DEFAULT 'FREE',
    "jobs_created" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "type" "TokenType" NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_place_id_key" ON "businesses"("place_id");

-- CreateIndex
CREATE INDEX "businesses_state_idx" ON "businesses"("state");

-- CreateIndex
CREATE INDEX "businesses_business_type_idx" ON "businesses"("business_type");

-- CreateIndex
CREATE INDEX "businesses_rating_idx" ON "businesses"("rating");

-- CreateIndex
CREATE INDEX "businesses_serp_domain_confidence_idx" ON "businesses"("serp_domain_confidence");

-- CreateIndex
CREATE INDEX "businesses_serp_email_confidence_idx" ON "businesses"("serp_email_confidence");

-- CreateIndex
CREATE INDEX "businesses_serp_phone_confidence_idx" ON "businesses"("serp_phone_confidence");

-- CreateIndex
CREATE INDEX "businesses_serp_email_idx" ON "businesses"("serp_email");

-- CreateIndex
CREATE INDEX "businesses_serp_phone_idx" ON "businesses"("serp_phone");

-- CreateIndex
CREATE INDEX "businesses_domain_email_idx" ON "businesses"("domain_email");

-- CreateIndex
CREATE INDEX "businesses_domain_phone_idx" ON "businesses"("domain_phone");

-- CreateIndex
CREATE INDEX "businesses_job_id_idx" ON "businesses"("job_id");

-- CreateIndex
CREATE INDEX "businesses_city_state_idx" ON "businesses"("city", "state");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_createdAt_idx" ON "jobs"("createdAt");

-- CreateIndex
CREATE INDEX "jobs_business_type_idx" ON "jobs"("business_type");

-- CreateIndex
CREATE INDEX "jobs_user_id_idx" ON "jobs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_email_idx" ON "verification_tokens"("email");

-- CreateIndex
CREATE INDEX "verification_tokens_token_idx" ON "verification_tokens"("token");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

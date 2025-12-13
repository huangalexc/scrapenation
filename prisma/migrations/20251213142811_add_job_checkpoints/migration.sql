/*
  Warnings:

  - You are about to drop the column `created_at` on the `job_businesses` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `user_businesses` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "job_businesses" DROP COLUMN "created_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "current_step" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "last_progress_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "user_businesses" DROP COLUMN "created_at",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "businesses_place_id_idx" ON "businesses"("place_id");

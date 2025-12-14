-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "enrichment_time" INTEGER,
ADD COLUMN     "places_search_time" INTEGER,
ADD COLUMN     "scraping_time" INTEGER;

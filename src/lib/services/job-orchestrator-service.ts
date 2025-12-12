import { prisma } from '../prisma';
import { zipCodeService } from './zipcode-service';
import { placesService } from './places-service';
import { serpEnrichmentService } from './serp-enrichment-service';
import { domainScraperService } from './domain-scraper-service';
import { tierLimitsService } from './tier-limits-service';
import { logError } from '../utils/errors';
import type { Job, JobStatus } from '@prisma/client';
import type { BusinessToEnrich } from '../types/enrichment';
import type { DomainToScrape } from '../types/scraping';

export interface JobConfig {
  userId: string;
  businessType: string;
  geography: string[]; // Array of states or ["nationwide"]
  zipPercentage?: number;
  minDomainConfidence?: number;
  zipCodes?: string[]; // Optional explicit list of ZIP codes
}

export interface JobProgress {
  jobId: string;
  status: JobStatus;
  totalZips: number;
  zipsProcessed: number;
  businessesFound: number;
  businessesEnriched: number;
  businessesScraped: number;
  errorsEncountered: number;
  estimatedCost: number;
}

export class JobOrchestratorService {
  /**
   * Create a new scraping job (Railway worker will pick it up)
   */
  async startJob(config: JobConfig): Promise<{ success: boolean; jobId?: string; error?: string }> {
    console.log(`[JobOrchestrator] Creating new job`, config);

    // Check if user can create a job
    const canCreate = await tierLimitsService.canCreateJob(config.userId);
    if (!canCreate.allowed) {
      return { success: false, error: canCreate.reason };
    }

    // Validate job configuration against tier limits
    const validConfig = await tierLimitsService.validateJobConfig(config.userId, {
      geography: config.geography,
      zipCodes: config.zipCodes,
    });

    if (!validConfig.valid) {
      return { success: false, error: validConfig.reason };
    }

    // Create job record as PENDING (worker will process it)
    const job = await prisma.job.create({
      data: {
        userId: config.userId,
        businessType: config.businessType,
        geography: config.geography,
        zipPercentage: config.zipPercentage || 30,
        status: 'PENDING', // Worker will pick this up
      },
    });

    // Increment job counter
    await tierLimitsService.incrementJobCount(config.userId);

    console.log(`[JobOrchestrator] Created job ${job.id} - waiting for worker to process`);

    return { success: true, jobId: job.id };
  }

  /**
   * Execute job pipeline (called by Railway worker)
   */
  async executeJob(jobId: string): Promise<void> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { user: true },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const config: JobConfig = {
      userId: job.userId,
      businessType: job.businessType,
      geography: job.geography,
      zipPercentage: job.zipPercentage,
      minDomainConfidence: 70,
    };

    await this.runPipeline(jobId, config);
  }

  /**
   * Main pipeline execution - all steps run with parallel processing
   */
  private async runPipeline(jobId: string, config: JobConfig): Promise<void> {
    try {
      console.log(`[JobOrchestrator] Starting pipeline for job ${jobId}`);

      // STEP 1: Select ZIP codes
      console.log(`[JobOrchestrator] Step 1: Selecting ZIP codes`);
      const zipCodes = await this.selectZipCodes(config);
      await this.updateJobProgress(jobId, { totalZips: zipCodes.length });

      console.log(`[JobOrchestrator] Selected ${zipCodes.length} ZIP codes`);

      // STEP 2: Search Places API (in parallel)
      console.log(`[JobOrchestrator] Step 2: Searching Google Places`);
      const places = await placesService.searchMultipleLocations(
        zipCodes.map((zip) => ({
          zipCode: zip.zipCode,
          city: zip.city,
          state: zip.state,
          latitude: zip.latitude,
          longitude: zip.longitude,
          radiusMiles: zip.radiusMi,
        })),
        config.businessType,
        (completed, total) => {
          this.updateJobProgress(jobId, { zipsProcessed: completed });
        }
      );

      console.log(`[JobOrchestrator] Found ${places.length} unique businesses`);

      // Save businesses to database
      await this.saveBusinesses(jobId, places);
      await this.updateJobProgress(jobId, { businessesFound: places.length });

      // STEP 3: SERP Enrichment (in parallel batches)
      console.log(`[JobOrchestrator] Step 3: Enriching with SERP + GPT`);
      const businessesToEnrich: BusinessToEnrich[] = places.map((place) => ({
        id: place.placeId,
        name: place.name,
        city: place.city || null,
        state: place.state || null,
      }));

      const enriched = await serpEnrichmentService.enrichBusinesses(
        businessesToEnrich,
        {
          concurrency: 5, // 5 concurrent SERP + GPT calls
          batchSize: 50,
          onProgress: (completed, total) => {
            this.updateJobProgress(jobId, {
              businessesEnriched: completed,
              customSearchCalls: completed,
              openaiCalls: completed,
            });
          },
        }
      );

      // Update businesses with enrichment data
      await this.updateBusinessesWithEnrichment(enriched);

      console.log(`[JobOrchestrator] Enriched ${enriched.length} businesses`);

      // STEP 4: Domain Scraping (in parallel, only high-confidence domains)
      console.log(`[JobOrchestrator] Step 4: Scraping domains`);
      const minConfidence = config.minDomainConfidence || 70;
      const domainsToScrape: DomainToScrape[] = enriched
        .filter(
          (b) =>
            b.enrichment.domain &&
            b.enrichment.domainConfidence &&
            b.enrichment.domainConfidence >= minConfidence
        )
        .map((b) => ({
          id: b.id,
          domain: b.enrichment.domain!,
          businessName: b.name,
        }));

      console.log(`[JobOrchestrator] Scraping ${domainsToScrape.length} high-confidence domains`);

      const scraped = await domainScraperService.scrapeDomains(domainsToScrape, {
        concurrency: 10, // 10 concurrent scrapes
        batchSize: 100,
        onProgress: (completed, total) => {
          this.updateJobProgress(jobId, { businessesScraped: completed });
        },
      });

      // Update businesses with scraping data
      await this.updateBusinessesWithScraping(scraped);

      console.log(`[JobOrchestrator] Scraped ${scraped.length} domains`);

      // Calculate costs
      const estimatedCost = this.calculateCost({
        placesApiCalls: zipCodes.length,
        customSearchCalls: enriched.length,
        openaiCalls: enriched.length,
      });

      // Mark job complete
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          estimatedCost,
        },
      });

      console.log(`[JobOrchestrator] Job ${jobId} completed successfully`);
      console.log(`[JobOrchestrator] Estimated cost: $${estimatedCost.toFixed(2)}`);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Select ZIP codes based on configuration and enforce tier limits
   */
  private async selectZipCodes(config: JobConfig) {
    const isNationwide =
      config.geography.length === 1 && config.geography[0].toLowerCase() === 'nationwide';

    const zipCodes = await zipCodeService.getFilteredZipCodes({
      states: isNationwide ? undefined : config.geography,
      nationwide: isNationwide,
      topPercent: config.zipPercentage || 30,
    });

    // Get user's tier limits
    const tierInfo = await tierLimitsService.getUserTierInfo(config.userId);
    if (!tierInfo) {
      throw new Error('User not found');
    }

    // Enforce ZIP code limit for free tier
    if (tierInfo.tier === 'FREE' && zipCodes.length > tierInfo.limits.maxZipsPerJob) {
      console.log(
        `[JobOrchestrator] Free tier limit: restricting to ${tierInfo.limits.maxZipsPerJob} ZIP codes (found ${zipCodes.length})`
      );
      return zipCodes.slice(0, tierInfo.limits.maxZipsPerJob);
    }

    return zipCodes;
  }

  /**
   * Save businesses to database with deduplication
   * Returns count of new vs reused businesses for cost tracking
   */
  private async saveBusinesses(
    jobId: string,
    places: any[]
  ): Promise<{ newCount: number; reusedCount: number }> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { userId: true },
    });

    if (!job) throw new Error(`Job ${jobId} not found`);

    const placeIds = places.map((p) => p.placeId);

    // Find existing businesses by placeId
    const existingBusinesses = await prisma.business.findMany({
      where: {
        placeId: { in: placeIds },
      },
      select: { id: true, placeId: true },
    });

    const existingPlaceIdMap = new Map(
      existingBusinesses.map((b) => [b.placeId, b.id])
    );

    // Separate new vs existing
    const newPlaces = places.filter((p) => !existingPlaceIdMap.has(p.placeId));
    const reusedPlaces = places.filter((p) => existingPlaceIdMap.has(p.placeId));

    console.log(
      `[JobOrchestrator] Deduplication: ${newPlaces.length} new, ${reusedPlaces.length} reused (${((reusedPlaces.length / places.length) * 100).toFixed(1)}% cost savings)`
    );

    // Create new businesses
    if (newPlaces.length > 0) {
      await prisma.business.createMany({
        data: newPlaces.map((place) => ({
          placeId: place.placeId,
          name: place.name,
          formattedAddress: place.formattedAddress,
          latitude: place.latitude,
          longitude: place.longitude,
          rating: place.rating,
          userRatingsTotal: place.userRatingsTotal,
          priceLevel: place.priceLevel,
          types: place.types,
          businessType: place.businessType,
          city: place.city,
          state: place.state,
          postalCode: place.postalCode,
        })),
        skipDuplicates: true,
      });
    }

    // Get all business IDs (newly created + existing)
    const allBusinesses = await prisma.business.findMany({
      where: {
        placeId: { in: placeIds },
      },
      select: { id: true, placeId: true },
    });

    const placeIdToBusinessId = new Map(
      allBusinesses.map((b) => [b.placeId, b.id])
    );

    // Create JobBusiness records (track which job found which business)
    const jobBusinessRecords = places.map((place) => ({
      jobId,
      businessId: placeIdToBusinessId.get(place.placeId)!,
      wasReused: existingPlaceIdMap.has(place.placeId),
    }));

    await prisma.jobBusiness.createMany({
      data: jobBusinessRecords,
      skipDuplicates: true,
    });

    // Create UserBusiness records (grant user access to businesses)
    const userBusinessRecords = places.map((place) => ({
      userId: job.userId,
      businessId: placeIdToBusinessId.get(place.placeId)!,
      jobId,
    }));

    await prisma.userBusiness.createMany({
      data: userBusinessRecords,
      skipDuplicates: true, // User might already have access from previous job
    });

    return {
      newCount: newPlaces.length,
      reusedCount: reusedPlaces.length,
    };
  }

  /**
   * Update businesses with SERP enrichment data
   */
  private async updateBusinessesWithEnrichment(enriched: any[]): Promise<void> {
    // Batch update businesses
    await Promise.all(
      enriched.map((business) =>
        prisma.business.updateMany({
          where: { placeId: business.id },
          data: {
            serpDomain: business.enrichment.domain,
            serpDomainConfidence: business.enrichment.domainConfidence,
            serpEmail: business.enrichment.email,
            serpEmailConfidence: business.enrichment.emailConfidence,
            serpPhone: business.enrichment.phone,
            serpPhoneConfidence: business.enrichment.phoneConfidence,
          },
        })
      )
    );
  }

  /**
   * Update businesses with domain scraping data
   */
  private async updateBusinessesWithScraping(scraped: any[]): Promise<void> {
    await Promise.all(
      scraped.map((domain) =>
        prisma.business.updateMany({
          where: { placeId: domain.id },
          data: {
            domainEmail: domain.result.email,
            domainPhone: domain.result.phone,
            scrapeError: domain.result.error,
          },
        })
      )
    );
  }

  /**
   * Update job progress
   */
  private async updateJobProgress(
    jobId: string,
    updates: {
      totalZips?: number;
      zipsProcessed?: number;
      businessesFound?: number;
      businessesEnriched?: number;
      businessesScraped?: number;
      errorsEncountered?: number;
      placesApiCalls?: number;
      customSearchCalls?: number;
      openaiCalls?: number;
      estimatedCost?: number;
    }
  ): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: updates,
    });
  }

  /**
   * Mark job as failed
   */
  private async markJobFailed(jobId: string, error: any): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorLog: error instanceof Error ? error.message : String(error),
      },
    });
  }

  /**
   * Calculate estimated cost
   */
  private calculateCost(calls: {
    placesApiCalls: number;
    customSearchCalls: number;
    openaiCalls: number;
  }): number {
    // Pricing estimates (adjust based on actual rates)
    const PLACES_COST_PER_CALL = 0.032; // $32 per 1000 requests
    const CUSTOM_SEARCH_COST_PER_CALL = 0.005; // $5 per 1000 queries
    const OPENAI_COST_PER_CALL = 0.001; // Approximate for gpt-4o-mini

    return (
      calls.placesApiCalls * PLACES_COST_PER_CALL +
      calls.customSearchCalls * CUSTOM_SEARCH_COST_PER_CALL +
      calls.openaiCalls * OPENAI_COST_PER_CALL
    );
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId: string): Promise<Job | null> {
    return prisma.job.findUnique({
      where: { id: jobId },
    });
  }

  /**
   * Pause a running job
   */
  async pauseJob(jobId: string): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'PAUSED' },
    });
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Get all jobs
   */
  async getAllJobs(): Promise<Job[]> {
    return prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}

// Export singleton instance
export const jobOrchestratorService = new JobOrchestratorService();

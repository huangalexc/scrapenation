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
   * Main pipeline execution - supports resume from checkpoint
   */
  private async runPipeline(jobId: string, config: JobConfig): Promise<void> {
    try {
      // Get current job state
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) throw new Error(`Job ${jobId} not found`);

      const currentStep = job.currentStep;
      console.log(`[JobOrchestrator] Starting pipeline for job ${jobId} from step: ${currentStep}`);

      let zipCodes: any[] = [];
      let places: any[] = [];
      let enriched: any[] = [];

      // STEP 1: Select ZIP codes (skip if already done)
      if (['pending', 'zips'].includes(currentStep)) {
        console.log(`[JobOrchestrator] Step 1: Selecting ZIP codes`);
        await this.setCheckpoint(jobId, 'zips');

        zipCodes = await this.selectZipCodes(config);
        await this.updateJobProgress(jobId, { totalZips: zipCodes.length });
        console.log(`[JobOrchestrator] Selected ${zipCodes.length} ZIP codes`);
      } else {
        console.log(`[JobOrchestrator] Step 1: Skipping ZIP selection (already completed)`);
      }

      // STEP 2: Search Places API (skip if already done)
      if (['pending', 'zips', 'places'].includes(currentStep)) {
        console.log(`[JobOrchestrator] Step 2: Searching Google Places`);
        await this.setCheckpoint(jobId, 'places');

        // If we didn't just select ZIPs, we need to get them from config
        if (zipCodes.length === 0) {
          zipCodes = await this.selectZipCodes(config);
        }

        places = await placesService.searchMultipleLocations(
          zipCodes.map((zip) => ({
            zipCode: zip.zipCode,
            city: zip.city,
            state: zip.state,
            latitude: zip.latitude,
            longitude: zip.longitude,
            radiusMiles: zip.radiusMi,
          })),
          config.businessType,
          (completed, total, apiCalls) => {
            this.updateJobProgress(jobId, {
              zipsProcessed: completed,
              placesApiCalls: apiCalls || completed, // Track actual Places API calls (including pagination)
            });
          }
        );

        console.log(`[JobOrchestrator] Found ${places.length} unique businesses`);
        await this.saveBusinesses(jobId, places);
        await this.updateJobProgress(jobId, { businessesFound: places.length });
      } else {
        console.log(`[JobOrchestrator] Step 2: Skipping Places search (already completed)`);
        // Load existing businesses from database
        places = await this.loadBusinessesFromDatabase(jobId);
        console.log(`[JobOrchestrator] Loaded ${places.length} businesses from database`);
      }

      // STEP 3: SERP Enrichment (resume from partial progress)
      if (['pending', 'zips', 'places', 'enrichment'].includes(currentStep)) {
        console.log(`[JobOrchestrator] Step 3: Enriching with SERP + GPT`);
        await this.setCheckpoint(jobId, 'enrichment');

        // Get businesses that haven't been enriched yet
        const businessesToEnrich = await this.getUnenrichedBusinesses(jobId);
        console.log(`[JobOrchestrator] ${businessesToEnrich.length} businesses need enrichment (${job.businessesEnriched} already done)`);

        if (businessesToEnrich.length > 0) {
          const newlyEnriched = await serpEnrichmentService.enrichBusinesses(
            businessesToEnrich,
            {
              concurrency: 5,
              batchSize: 50,
              onProgress: (completed, total) => {
                this.updateJobProgress(jobId, {
                  businessesEnriched: job.businessesEnriched + completed,
                  customSearchCalls: job.customSearchCalls + completed,
                  openaiCalls: job.openaiCalls + completed,
                });
              },
            }
          );

          await this.updateBusinessesWithEnrichment(newlyEnriched);
          console.log(`[JobOrchestrator] Enriched ${newlyEnriched.length} businesses`);
        }

        // Load all enriched businesses
        enriched = await this.loadEnrichedBusinesses(jobId);
      } else {
        console.log(`[JobOrchestrator] Step 3: Skipping enrichment (already completed)`);
        enriched = await this.loadEnrichedBusinesses(jobId);
        console.log(`[JobOrchestrator] Loaded ${enriched.length} enriched businesses`);
      }

      // STEP 4: Domain Scraping (resume from partial progress)
      if (['pending', 'zips', 'places', 'enrichment', 'scraping'].includes(currentStep)) {
        console.log(`[JobOrchestrator] Step 4: Scraping domains`);
        await this.setCheckpoint(jobId, 'scraping');

        const minConfidence = config.minDomainConfidence || 70;

        // Get the current count of already-scraped businesses
        const alreadyScraped = await prisma.business.count({
          where: {
            jobBusinesses: { some: { jobId } },
            OR: [
              { domainEmail: { not: null } },
              { scrapeError: { not: null } },
            ],
          },
        });

        // Get domains that haven't been scraped yet
        const domainsToScrape = await this.getUnscrapedDomains(jobId, minConfidence);
        console.log(`[JobOrchestrator] ${domainsToScrape.length} domains need scraping (${alreadyScraped} already done)`);

        if (domainsToScrape.length > 0) {
          // Process in smaller batches and save incrementally to avoid losing progress on stall
          const SCRAPE_BATCH_SIZE = 25; // Save every 25 domains
          let totalScraped = 0;

          for (let i = 0; i < domainsToScrape.length; i += SCRAPE_BATCH_SIZE) {
            const batch = domainsToScrape.slice(i, i + SCRAPE_BATCH_SIZE);
            console.log(`[JobOrchestrator] Scraping batch ${Math.floor(i / SCRAPE_BATCH_SIZE) + 1} (${batch.length} domains)`);

            const scraped = await domainScraperService.scrapeDomains(batch, {
              concurrency: 5, // Reduced from 10 to 5 to prevent Puppeteer resource exhaustion
              batchSize: batch.length,
              onProgress: (completed, total) => {
                // Use actual count from database, not stale job.businessesScraped
                this.updateJobProgress(jobId, { businessesScraped: alreadyScraped + totalScraped + completed });
              },
            });

            // Save results immediately after each batch
            await this.updateBusinessesWithScraping(scraped);
            totalScraped += scraped.length;
            console.log(`[JobOrchestrator] Saved batch ${Math.floor(i / SCRAPE_BATCH_SIZE) + 1} - Total scraped: ${totalScraped}/${domainsToScrape.length}`);
          }

          console.log(`[JobOrchestrator] Completed all scraping - ${totalScraped} domains`);
        }
      } else {
        console.log(`[JobOrchestrator] Step 4: Skipping domain scraping (already completed)`);
      }

      // Calculate costs and mark complete
      const finalJob = await prisma.job.findUnique({ where: { id: jobId } });
      const estimatedCost = this.calculateCost({
        placesApiCalls: finalJob!.placesApiCalls,
        customSearchCalls: finalJob!.customSearchCalls,
        openaiCalls: finalJob!.openaiCalls,
      });

      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          currentStep: 'completed',
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
   * Set checkpoint and update lastProgressAt
   */
  private async setCheckpoint(jobId: string, step: string): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        currentStep: step,
        lastProgressAt: new Date(),
      },
    });
  }

  /**
   * Load businesses from database for resume
   */
  private async loadBusinessesFromDatabase(jobId: string): Promise<any[]> {
    const jobBusinesses = await prisma.jobBusiness.findMany({
      where: { jobId },
      include: { business: true },
    });

    return jobBusinesses.map(jb => ({
      placeId: jb.business.placeId,
      name: jb.business.name,
      city: jb.business.city,
      state: jb.business.state,
    }));
  }

  /**
   * Get businesses that haven't been enriched yet
   */
  private async getUnenrichedBusinesses(jobId: string): Promise<BusinessToEnrich[]> {
    const businesses = await prisma.business.findMany({
      where: {
        jobBusinesses: { some: { jobId } },
        serpDomain: null, // Not enriched yet
      },
      select: {
        placeId: true,
        name: true,
        city: true,
        state: true,
      },
    });

    return businesses.map(b => ({
      id: b.placeId,
      name: b.name,
      city: b.city || null,
      state: b.state || null,
    }));
  }

  /**
   * Load all enriched businesses
   */
  private async loadEnrichedBusinesses(jobId: string): Promise<any[]> {
    const businesses = await prisma.business.findMany({
      where: {
        jobBusinesses: { some: { jobId } },
      },
      select: {
        placeId: true,
        name: true,
        city: true,
        state: true,
        serpDomain: true,
        serpDomainConfidence: true,
        serpEmail: true,
        serpEmailConfidence: true,
        serpPhone: true,
        serpPhoneConfidence: true,
      },
    });

    return businesses.map(b => ({
      id: b.placeId,
      name: b.name,
      city: b.city,
      state: b.state,
      enrichment: {
        domain: b.serpDomain,
        domainConfidence: b.serpDomainConfidence,
        email: b.serpEmail,
        emailConfidence: b.serpEmailConfidence,
        phone: b.serpPhone,
        phoneConfidence: b.serpPhoneConfidence,
      },
    }));
  }

  /**
   * Get domains that haven't been scraped yet
   */
  private async getUnscrapedDomains(jobId: string, minConfidence: number): Promise<DomainToScrape[]> {
    const businesses = await prisma.business.findMany({
      where: {
        jobBusinesses: { some: { jobId } },
        serpDomainConfidence: { gte: minConfidence },
        domainEmail: null, // Not scraped yet
        scrapeError: null, // Not failed
      },
      select: {
        placeId: true,
        name: true,
        serpDomain: true,
      },
    });

    return businesses.map(b => ({
      id: b.placeId,
      domain: b.serpDomain!,
      businessName: b.name,
    }));
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
    console.log(`[JobOrchestrator] Updating ${scraped.length} businesses with scraping results`);

    const updateResults = await Promise.all(
      scraped.map(async (domain) => {
        const result = await prisma.business.updateMany({
          where: { placeId: domain.id },
          data: {
            domainEmail: domain.result.email,
            domainPhone: domain.result.phone,
            scrapeError: domain.result.error,
          },
        });

        // Log if update didn't match any records
        if (result.count === 0) {
          console.warn(`[JobOrchestrator] No business found with placeId: ${domain.id} (${domain.businessName})`);
        }

        return result;
      })
    );

    const totalUpdated = updateResults.reduce((sum, r) => sum + r.count, 0);
    console.log(`[JobOrchestrator] Updated ${totalUpdated} businesses in database`);
  }

  /**
   * Update job progress and lastProgressAt timestamp
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
      data: {
        ...updates,
        lastProgressAt: new Date(), // Update stall detection timestamp
      },
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

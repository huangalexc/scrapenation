import { dataForSEOService } from './dataforseo-service';
import { gptEnrichmentService } from './gpt-enrichment-service';
import { processBatch } from '../utils/batch';
import { logError } from '../utils/errors';
import type { BusinessToEnrich, EnrichedBusiness, EnrichmentResult } from '../types/enrichment';

export interface EnrichmentOptions {
  concurrency?: number;
  batchSize?: number;
  numSearchResults?: number;
  onProgress?: (completed: number, total: number) => void;
  onError?: (error: Error, business: BusinessToEnrich) => void;
}

export class SERPEnrichmentService {
  /**
   * Enrich a single business with SERP + GPT
   */
  async enrichBusiness(business: BusinessToEnrich): Promise<EnrichedBusiness> {
    try {
      // Step 1: Build search query
      const query = `${business.name} ${business.city || ''} ${business.state || ''}`.trim();

      // Step 2: Perform DataForSEO SERP search
      const serpResponse = await dataForSEOService.searchGoogle(query, {
        depth: 10, // Get top 10 results
      });

      // Convert to format expected by GPT
      const serpResults = serpResponse.results.map(result => ({
        title: result.title || '',
        url: result.url || '',
        snippet: result.description || '',
      }));

      // Step 3: Extract information using GPT
      const enrichment = await gptEnrichmentService.extractBusinessInfo(
        business.name,
        business.city,
        business.state,
        serpResults
      );

      return {
        ...business,
        enrichment,
      };
    } catch (error) {
      logError(error as Error, {
        businessId: business.id,
        businessName: business.name,
      });

      // Return business with null enrichment on error
      return {
        ...business,
        enrichment: {
          domain: null,
          domainConfidence: null,
          email: null,
          emailConfidence: null,
          phone: null,
          phoneConfidence: null,
        },
      };
    }
  }

  /**
   * Enrich multiple businesses in parallel with batching
   */
  async enrichBusinesses(
    businesses: BusinessToEnrich[],
    options: EnrichmentOptions = {}
  ): Promise<EnrichedBusiness[]> {
    const {
      concurrency = 5, // Process 5 businesses at a time
      batchSize = 50, // Process in batches of 50
      onProgress,
      onError,
    } = options;

    console.log(
      `[SERPEnrichmentService] Starting enrichment of ${businesses.length} businesses`
    );
    console.log(`[SERPEnrichmentService] Concurrency: ${concurrency}, Batch size: ${batchSize}`);

    const results = await processBatch(
      businesses,
      async (business) => this.enrichBusiness(business),
      {
        concurrency,
        batchSize,
        onProgress: onProgress
          ? (completed, total) => {
              onProgress(completed, total);
              if (completed % 10 === 0 || completed === total) {
                console.log(
                  `[SERPEnrichmentService] Progress: ${completed}/${total} businesses enriched`
                );
              }
            }
          : undefined,
        onError: (error, business) => {
          logError(error, {
            businessId: business.id,
            businessName: business.name,
          });
          if (onError) {
            onError(error, business);
          }
        },
      }
    );

    console.log(`[SERPEnrichmentService] Completed enrichment of ${results.length} businesses`);

    return results;
  }

  /**
   * Get enrichment statistics
   */
  getEnrichmentStats(enriched: EnrichedBusiness[]): {
    total: number;
    withDomain: number;
    withEmail: number;
    withPhone: number;
    avgDomainConfidence: number;
    avgEmailConfidence: number;
    avgPhoneConfidence: number;
  } {
    const withDomain = enriched.filter((b) => b.enrichment.domain !== null);
    const withEmail = enriched.filter((b) => b.enrichment.email !== null);
    const withPhone = enriched.filter((b) => b.enrichment.phone !== null);

    const avgDomainConfidence =
      withDomain.reduce((sum, b) => sum + (b.enrichment.domainConfidence || 0), 0) /
        (withDomain.length || 1);

    const avgEmailConfidence =
      withEmail.reduce((sum, b) => sum + (b.enrichment.emailConfidence || 0), 0) /
        (withEmail.length || 1);

    const avgPhoneConfidence =
      withPhone.reduce((sum, b) => sum + (b.enrichment.phoneConfidence || 0), 0) /
        (withPhone.length || 1);

    return {
      total: enriched.length,
      withDomain: withDomain.length,
      withEmail: withEmail.length,
      withPhone: withPhone.length,
      avgDomainConfidence: Math.round(avgDomainConfidence * 10) / 10,
      avgEmailConfidence: Math.round(avgEmailConfidence * 10) / 10,
      avgPhoneConfidence: Math.round(avgPhoneConfidence * 10) / 10,
    };
  }
}

// Export singleton instance
export const serpEnrichmentService = new SERPEnrichmentService();

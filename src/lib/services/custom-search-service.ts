import { google } from 'googleapis';
import { env } from '../config/env';
import { CustomSearchError, QuotaExceededError, logError } from '../utils/errors';
import { withRetry, shouldRetryError, isQuotaError } from '../utils/retry';
import type { SERPResult } from '../types/enrichment';

export class CustomSearchService {
  private customsearch;
  private apiKey: string;
  private searchEngineId: string;

  constructor() {
    this.customsearch = google.customsearch('v1');
    this.apiKey = env.google.customSearchApiKey;
    this.searchEngineId = env.google.customSearchEngineId;

    if (!this.apiKey || !this.searchEngineId) {
      console.warn('⚠️  Google Custom Search API not fully configured');
    }
  }

  /**
   * Perform a custom search query
   */
  async search(query: string, numResults: number = 10): Promise<SERPResult[]> {
    try {
      const response = await withRetry(
        async () => {
          return await this.customsearch.cse.list({
            auth: this.apiKey,
            cx: this.searchEngineId,
            q: query,
            num: Math.min(numResults, 10), // API max is 10
          });
        },
        {
          maxAttempts: 3,
          shouldRetry: (error) => {
            if (isQuotaError(error)) {
              throw new QuotaExceededError('Google Custom Search API', {
                query,
                error: error.message,
              });
            }
            return shouldRetryError(error);
          },
          onRetry: (attempt, error) => {
            console.log(
              `[CustomSearchService] Retry attempt ${attempt} for query "${query}": ${error.message}`
            );
          },
        }
      );

      if (!response.data.items || response.data.items.length === 0) {
        return [];
      }

      return response.data.items.map((item) => ({
        title: item.title || '',
        snippet: item.snippet || '',
        url: item.link || '',
      }));
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        throw error;
      }

      logError(error as Error, { query, numResults });
      throw new CustomSearchError('Failed to perform custom search', {
        query,
        originalError: (error as Error).message,
      });
    }
  }

  /**
   * Build search query for a business
   */
  buildBusinessQuery(businessName: string, city?: string | null, state?: string | null): string {
    const parts = [businessName];

    if (city) {
      parts.push(city);
    }

    if (state) {
      parts.push(state);
    }

    return parts.join(' ');
  }

  /**
   * Search for a specific business
   */
  async searchBusiness(
    businessName: string,
    city?: string | null,
    state?: string | null,
    numResults: number = 10
  ): Promise<SERPResult[]> {
    const query = this.buildBusinessQuery(businessName, city, state);
    return this.search(query, numResults);
  }
}

// Export singleton instance
export const customSearchService = new CustomSearchService();

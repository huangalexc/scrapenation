import axios from 'axios';
import { env } from '../config/env';
import { logError } from '../utils/errors';
import { withRetry, shouldRetryError } from '../utils/retry';

export interface DataForSEOSerpResult {
  type: string;
  rank_group: number;
  rank_absolute: number;
  domain: string;
  title?: string;
  description?: string;
  url?: string;
}

export interface DataForSEOResponse {
  results: DataForSEOSerpResult[];
  keyword: string;
}

export class DataForSEOService {
  private apiUrl = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';
  private authHeader: string;

  constructor() {
    const credentials = env.dataForSEO.base64Credentials;

    if (!credentials) {
      console.warn('⚠️  DataForSEO credentials not configured');
    }

    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * Search Google SERP via DataForSEO
   * Returns top 10 organic results by default
   */
  async searchGoogle(query: string, options?: {
    locationCode?: number;
    languageCode?: string;
    depth?: number;
  }): Promise<DataForSEOResponse> {
    try {
      const response = await withRetry(
        async () => {
          return await axios.post(
            this.apiUrl,
            [{
              keyword: query,
              location_code: options?.locationCode || 2840, // USA
              language_code: options?.languageCode || 'en',
              depth: options?.depth || 10,
              device: 'desktop',
              os: 'windows',
            }],
            {
              headers: {
                'Authorization': this.authHeader,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            }
          );
        },
        {
          maxAttempts: 3,
          shouldRetry: (error) => {
            // Don't retry on auth errors
            if (error.response?.status === 401 || error.response?.status === 403) {
              return false;
            }
            return shouldRetryError(error);
          },
          onRetry: (attempt, error) => {
            console.log(
              `[DataForSEO] Retry attempt ${attempt} for query "${query}": ${error.message}`
            );
          },
        }
      );

      // DataForSEO response structure: { tasks: [{ result: [{ items: [...] }] }] }
      const task = response.data.tasks?.[0];

      if (!task || task.status_code !== 20000) {
        throw new Error(`DataForSEO API error: ${task?.status_message || 'Unknown error'}`);
      }

      const result = task.result?.[0];
      if (!result) {
        return { results: [], keyword: query };
      }

      // Filter for organic results only
      const organicResults = (result.items || [])
        .filter((item: any) => item.type === 'organic')
        .map((item: any) => ({
          type: item.type,
          rank_group: item.rank_group,
          rank_absolute: item.rank_absolute,
          domain: item.domain,
          title: item.title,
          description: item.description,
          url: item.url,
        }));

      return {
        results: organicResults,
        keyword: query,
      };
    } catch (error) {
      logError(error as Error, { query, options });

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('DataForSEO authentication failed - check API credentials');
        }
        if (error.response?.status === 402) {
          throw new Error('DataForSEO account has insufficient funds');
        }
      }

      throw new Error(`DataForSEO API request failed: ${(error as Error).message}`);
    }
  }

  /**
   * Batch search multiple queries
   * Returns results for all queries
   */
  async batchSearch(
    queries: string[],
    options?: {
      locationCode?: number;
      languageCode?: string;
      depth?: number;
    }
  ): Promise<Map<string, DataForSEOResponse>> {
    const results = new Map<string, DataForSEOResponse>();

    // DataForSEO supports multiple tasks in one request (up to 100)
    const batchSize = 100;

    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);

      try {
        const response = await withRetry(
          async () => {
            return await axios.post(
              this.apiUrl,
              batch.map(keyword => ({
                keyword,
                location_code: options?.locationCode || 2840,
                language_code: options?.languageCode || 'en',
                depth: options?.depth || 10,
                device: 'desktop',
                os: 'windows',
              })),
              {
                headers: {
                  'Authorization': this.authHeader,
                  'Content-Type': 'application/json',
                },
                timeout: 60000, // Longer timeout for batch
              }
            );
          },
          {
            maxAttempts: 3,
            shouldRetry: shouldRetryError,
          }
        );

        // Process each task result
        response.data.tasks?.forEach((task: any, index: number) => {
          const query = batch[index];

          if (task.status_code === 20000 && task.result?.[0]) {
            const result = task.result[0];
            const organicResults = (result.items || [])
              .filter((item: any) => item.type === 'organic')
              .map((item: any) => ({
                type: item.type,
                rank_group: item.rank_group,
                rank_absolute: item.rank_absolute,
                domain: item.domain,
                title: item.title,
                description: item.description,
                url: item.url,
              }));

            results.set(query, {
              results: organicResults,
              keyword: query,
            });
          } else {
            // Log failed task but continue
            console.warn(`[DataForSEO] Task failed for query "${query}": ${task.status_message}`);
            results.set(query, { results: [], keyword: query });
          }
        });

        // Rate limiting: small delay between batches
        if (i + batchSize < queries.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        logError(error as Error, { batch });
        // Continue with next batch
        console.error(`[DataForSEO] Batch failed, continuing with next batch: ${(error as Error).message}`);
      }
    }

    return results;
  }
}

// Export singleton instance
export const dataForSEOService = new DataForSEOService();

import { Client, PlaceInputType } from '@googlemaps/google-maps-services-js';
import { env } from '../config/env';
import { PlacesAPIError, QuotaExceededError, logError } from '../utils/errors';
import { withRetry, shouldRetryError, isQuotaError } from '../utils/retry';
import type { PlaceResult, NearbySearchParams, PlacesSearchResult } from '../types/places';

export class PlacesService {
  private client: Client;
  private apiKey: string;

  constructor() {
    this.client = new Client({});
    this.apiKey = env.google.placesApiKey;

    if (!this.apiKey) {
      console.warn('⚠️  Google Places API key not configured');
    }
  }

  /**
   * Convert miles to meters
   */
  private milesToMeters(miles: number): number {
    return miles * 1609.34;
  }

  /**
   * Extract city, state, and postal code from Google Places address_components
   */
  private extractAddressComponents(place: any): {
    city?: string;
    state?: string;
    postalCode?: string;
  } {
    try {
      const components = place.address_components || [];
      let city: string | undefined;
      let state: string | undefined;
      let postalCode: string | undefined;

      for (const component of components) {
        const types = component.types || [];

        if (types.includes('locality')) {
          city = component.long_name;
        } else if (types.includes('administrative_area_level_1')) {
          state = component.short_name; // Use short_name for state abbreviation (e.g., "NC")
        } else if (types.includes('postal_code')) {
          postalCode = component.long_name;
        }
      }

      return {
        city,
        state,
        postalCode,
      };
    } catch (error) {
      logError(error as Error, { place: place?.place_id });
      return {};
    }
  }

  /**
   * Perform a single nearby search API call
   */
  private async searchNearby(
    params: NearbySearchParams,
    pageToken?: string
  ): Promise<{
    results: any[];
    nextPageToken?: string;
  }> {
    try {
      const response = await withRetry(
        async () => {
          return await this.client.placesNearby({
            params: {
              location: { lat: params.latitude, lng: params.longitude },
              radius: params.radiusMeters,
              keyword: params.keyword,
              key: this.apiKey,
              ...(pageToken && { pagetoken: pageToken }),
            },
            timeout: 10000,
          });
        },
        {
          maxAttempts: 5,
          shouldRetry: (error) => {
            if (isQuotaError(error)) {
              throw new QuotaExceededError('Google Places API', {
                params,
                error: error.message,
              });
            }
            return shouldRetryError(error);
          },
          onRetry: (attempt, error) => {
            console.log(
              `[PlacesService] Retry attempt ${attempt} for nearby search: ${error.message}`
            );
          },
        }
      );

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new PlacesAPIError(`Places API returned status: ${response.data.status}`, {
          status: response.data.status,
          errorMessage: response.data.error_message,
        });
      }

      return {
        results: response.data.results || [],
        nextPageToken: response.data.next_page_token,
      };
    } catch (error) {
      if (error instanceof QuotaExceededError || error instanceof PlacesAPIError) {
        throw error;
      }
      logError(error as Error, { params, pageToken });
      throw new PlacesAPIError('Failed to search nearby places', {
        originalError: (error as Error).message,
      });
    }
  }

  /**
   * Search for places near a location with pagination
   * Retrieves up to 3 pages (60 results total)
   * Returns results and the number of API calls made
   */
  async searchPlacesNearby(
    params: NearbySearchParams,
    fallbackLocation?: { city: string; state: string }
  ): Promise<{ places: PlaceResult[]; apiCallsMade: number }> {
    const allResults: any[] = [];
    let nextPageToken: string | undefined;
    let pageCount = 0;
    const maxPages = 3;

    // First page
    const firstPage = await this.searchNearby(params);
    allResults.push(...firstPage.results);
    nextPageToken = firstPage.nextPageToken;
    pageCount++;

    // Additional pages
    while (nextPageToken && pageCount < maxPages) {
      // Google requires a short delay before using nextPageToken
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const page = await this.searchNearby(params, nextPageToken);
      allResults.push(...page.results);
      nextPageToken = page.nextPageToken;
      pageCount++;
    }

    // Transform results to our format
    const places = allResults.map((place) => this.transformPlace(place, params.keyword, fallbackLocation));

    return {
      places,
      apiCallsMade: pageCount, // Number of API calls made for this location
    };
  }

  /**
   * Transform Google Places result to our PlaceResult format
   */
  private transformPlace(
    place: any,
    businessType: string,
    fallbackLocation?: { city: string; state: string }
  ): PlaceResult {
    const formattedAddress = place.vicinity || place.formatted_address || '';
    const addressComponents = this.extractAddressComponents(place);

    // Use fallback location if city/state not found in address_components
    const city = addressComponents.city || fallbackLocation?.city;
    const state = addressComponents.state || fallbackLocation?.state;

    return {
      placeId: place.place_id,
      name: place.name,
      formattedAddress,
      latitude: place.geometry?.location?.lat || 0,
      longitude: place.geometry?.location?.lng || 0,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      priceLevel: place.price_level,
      types: place.types || [],
      businessType,
      city,
      state,
      postalCode: addressComponents.postalCode,
    };
  }

  /**
   * Search multiple ZIP codes and deduplicate results
   */
  async searchMultipleLocations(
    locations: Array<{
      zipCode: string;
      city: string;
      state: string;
      latitude: number;
      longitude: number;
      radiusMiles: number;
    }>,
    businessType: string,
    onProgress?: (completed: number, total: number, apiCalls?: number) => void
  ): Promise<PlaceResult[]> {
    const allPlaces: PlaceResult[] = [];
    const seenPlaceIds = new Set<string>();
    let totalApiCalls = 0;

    for (let i = 0; i < locations.length; i++) {
      const location = locations[i];

      try {
        const result = await this.searchPlacesNearby(
          {
            latitude: location.latitude,
            longitude: location.longitude,
            radiusMeters: this.milesToMeters(location.radiusMiles),
            keyword: businessType,
          },
          {
            city: location.city,
            state: location.state,
          }
        );

        // Track API calls
        totalApiCalls += result.apiCallsMade;

        // Deduplicate by place_id
        const newPlaces = result.places.filter((place) => {
          if (seenPlaceIds.has(place.placeId)) {
            return false;
          }
          seenPlaceIds.add(place.placeId);
          return true;
        });

        allPlaces.push(...newPlaces);

        if (onProgress) {
          onProgress(i + 1, locations.length, totalApiCalls);
        }

        // Rate limiting: small delay between requests
        if (i < locations.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        logError(error as Error, {
          zipCode: location.zipCode,
          businessType,
        });

        // If quota exceeded, stop processing
        if (error instanceof QuotaExceededError) {
          console.error(
            `[PlacesService] Quota exceeded at ZIP ${location.zipCode}. Processed ${i + 1}/${locations.length} locations.`
          );
          break;
        }

        // For other errors, continue with next location
        continue;
      }
    }

    return allPlaces;
  }
}

// Export singleton instance
export const placesService = new PlacesService();

export interface PlaceResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  types: string[];
  businessType: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  keyword: string;
}

export interface PlacesSearchResult {
  places: PlaceResult[];
  totalFound: number;
  zipCode: string;
}

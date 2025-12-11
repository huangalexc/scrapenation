export interface ZipCodeData {
  zipCode: string;
  population: number;
  areaSqMi: number;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  radiusMi: number;
}

export interface ZipCodeFilter {
  states?: string[];
  topPercent?: number;
  nationwide?: boolean;
}

export interface SERPResult {
  title: string;
  snippet: string;
  url: string;
}

export interface EnrichmentResult {
  domain: string | null;
  domainConfidence: number | null;
  email: string | null;
  emailConfidence: number | null;
  phone: string | null;
  phoneConfidence: number | null;
}

export interface BusinessToEnrich {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export interface EnrichedBusiness extends BusinessToEnrich {
  enrichment: EnrichmentResult;
}

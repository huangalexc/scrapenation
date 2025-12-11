export interface ScrapingResult {
  email: string | null;
  phone: string | null;
  error: string | null;
}

export interface DomainToScrape {
  id: string;
  domain: string;
  businessName: string;
}

export interface ScrapedDomain extends DomainToScrape {
  result: ScrapingResult;
}

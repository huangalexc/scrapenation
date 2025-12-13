import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { ScrapingError, logError } from '../utils/errors';
import { withRetry, isRetryableNetworkError } from '../utils/retry';
import { processBatch } from '../utils/batch';
import type { ScrapingResult, DomainToScrape, ScrapedDomain } from '../types/scraping';
import { puppeteerScraperService } from './puppeteer-scraper-service';

export interface ScrapingOptions {
  concurrency?: number;
  batchSize?: number;
  timeout?: number;
  minConfidenceThreshold?: number;
  usePuppeteerFallback?: boolean; // Enable Puppeteer fallback for failed scrapes
  onProgress?: (completed: number, total: number) => void;
  onError?: (error: Error, domain: DomainToScrape) => void;
}

export class DomainScraperService {
  // Remove word boundaries to handle emails in concatenated text
  private readonly EMAIL_REGEX =
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g;
  private readonly PHONE_REGEX =
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  /**
   * Known business directories and third-party sites to skip
   */
  private readonly DIRECTORY_DOMAINS = [
    'yelp.com',
    'google.com',
    'maps.google.com',
    'facebook.com',
    'instagram.com',
    'twitter.com',
    'linkedin.com',
    'yellowpages.com',
    'whitepages.com',
    'mapquest.com',
    'tripadvisor.com',
    'foursquare.com',
    'bbb.org',
    'angieslist.com',
    'thumbtack.com',
    'homeadvisor.com',
    'houzz.com',
    'zillow.com',
    'trulia.com',
    'realtor.com',
    'apartments.com',
    'rentals.com',
    'opentable.com',
    'resy.com',
    'seamless.com',
    'grubhub.com',
    'doordash.com',
    'ubereats.com',
    'postmates.com',
    'wikipedia.org',
    'nextdoor.com',
    'merchantcircle.com',
    'manta.com',
    'superpages.com',
    'local.com',
    'citysearch.com',
    'kudzu.com',
    'porch.com',
    'usnews.com',
    'healthgrades.com',
    'vitals.com',
    'zocdoc.com',
    'webmd.com',
  ];

  /**
   * Common contact page paths to check
   */
  private readonly CONTACT_PATHS = [
    '',
    '/contact',
    '/contact/',
    '/contact-us',
    '/contact-us/',
    '/contactus',
    '/about',
    '/about/',
    '/about-us',
    '/about-us/',
  ];

  /**
   * Track failed domains to avoid retrying other pages
   */
  private failedDomains = new Set<string>();

  /**
   * Check if domain is a known directory site
   */
  private isDirectorySite(domain: string): boolean {
    const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    return this.DIRECTORY_DOMAINS.some(dir => cleanDomain.includes(dir));
  }

  /**
   * Scrape a single domain for contact information
   */
  async scrapeDomain(
    domain: string,
    options: { timeout?: number; usePuppeteerFallback?: boolean } = {}
  ): Promise<ScrapingResult> {
    const { timeout = 3000, usePuppeteerFallback = false } = options;

    // Skip known directory sites
    if (this.isDirectorySite(domain)) {
      return {
        email: null,
        phone: null,
        error: 'DIRECTORY_SITE_SKIPPED',
      };
    }

    // Skip if this domain already failed on first page
    if (this.failedDomains.has(domain)) {
      return {
        email: null,
        phone: null,
        error: 'DOMAIN_PREVIOUSLY_FAILED',
      };
    }

    try {
      let firstPageFailed = false;
      let bestResult: { email: string | null; phone: string | null } = { email: null, phone: null };

      // Try multiple contact pages
      for (const path of this.CONTACT_PATHS) {
        const url = this.buildUrl(domain, path);

        try {
          const html = await this.fetchPage(url, timeout);
          const result = this.extractContactInfo(html);

          // If we found email, return it immediately
          if (result.email) {
            return { ...result, error: null };
          }

          // Store phone if found (but keep looking for email)
          if (result.phone && !bestResult.phone) {
            bestResult.phone = result.phone;
          }
        } catch (error) {
          // If first page (home page) fails, mark domain as failed and stop trying other pages
          if (path === '') {
            firstPageFailed = true;
            this.failedDomains.add(domain);
            throw error; // Throw to exit and return error
          }
          // Continue to next path if this one fails
          continue;
        }
      }

      // No email found with Cheerio
      // Try Puppeteer fallback if enabled and no email was found
      if (usePuppeteerFallback && !bestResult.email) {
        console.log(`[DomainScraper] Cheerio found no email for ${domain}, trying Puppeteer...`);
        try {
          const puppeteerResult = await puppeteerScraperService.scrapeDomain(domain, { timeout: 10000 });
          if (puppeteerResult.email) {
            console.log(`[DomainScraper] ✅ Puppeteer found email for ${domain}: ${puppeteerResult.email}`);
            // Combine Puppeteer email with Cheerio phone if we have it
            return {
              email: puppeteerResult.email,
              phone: puppeteerResult.phone || bestResult.phone,
              error: null,
            };
          }
          // If Puppeteer found phone but not email, use it
          if (puppeteerResult.phone && !bestResult.phone) {
            bestResult.phone = puppeteerResult.phone;
          }
        } catch (puppeteerError) {
          console.log(`[DomainScraper] Puppeteer also failed for ${domain}`);
          // Fall through to return what we have
        }
      }

      // Return whatever we found (might just be phone, or nothing)
      return {
        email: bestResult.email,
        phone: bestResult.phone,
        error: bestResult.email || bestResult.phone ? null : 'NO_CONTACT_INFO_FOUND',
      };
    } catch (error) {
      const errorMessage = this.classifyError(error);
      logError(error as Error, { domain });

      // Try Puppeteer fallback if enabled and Cheerio had an error
      if (usePuppeteerFallback) {
        console.log(`[DomainScraper] Cheerio error for ${domain}, trying Puppeteer fallback...`);
        try {
          const puppeteerResult = await puppeteerScraperService.scrapeDomain(domain, { timeout: 10000 });
          if (puppeteerResult.email || puppeteerResult.phone) {
            console.log(`[DomainScraper] Puppeteer recovered from Cheerio error for ${domain}`);
            return puppeteerResult;
          }
        } catch (puppeteerError) {
          console.log(`[DomainScraper] Puppeteer also failed for ${domain}`);
          // Fall through to return original error
        }
      }

      return {
        email: null,
        phone: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Fetch HTML from a URL with retry logic
   */
  private async fetchPage(url: string, timeout: number): Promise<string> {
    return withRetry(
      async () => {
        const response = await axios.get(url, {
          timeout,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
          maxRedirects: 5,
        });

        return response.data;
      },
      {
        maxAttempts: 2, // Only retry once for scraping
        shouldRetry: isRetryableNetworkError,
        onRetry: (attempt, error) => {
          console.log(`[DomainScraperService] Retry attempt ${attempt} for ${url}: ${error.message}`);
        },
      }
    );
  }

  /**
   * Extract contact information from HTML
   */
  private extractContactInfo(html: string): { email: string | null; phone: string | null } {
    const $ = cheerio.load(html);

    // Remove script and style tags
    $('script, style, noscript').remove();

    const allEmails: string[] = [];
    const allPhones: string[] = [];

    // 1. Extract emails from mailto: links
    $('a[href^="mailto:"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        const email = href.replace('mailto:', '').split('?')[0]; // Remove query params
        allEmails.push(email);
      }
    });

    // 2. Extract emails from visible text
    const text = $('body').text();
    const textEmails = text.match(this.EMAIL_REGEX) || [];
    allEmails.push(...textEmails);

    // 3. Extract emails from all href and data attributes (backup)
    $('*').each((_, elem) => {
      // Type guard: only process elements that have attribs
      if ('attribs' in elem && elem.attribs) {
        Object.values(elem.attribs).forEach((value) => {
          if (typeof value === 'string') {
            const matches = value.match(this.EMAIL_REGEX) || [];
            allEmails.push(...matches);
          }
        });
      }
    });

    // 4. Extract phone numbers from tel: links
    $('a[href^="tel:"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        const phone = href.replace('tel:', '').trim();
        allPhones.push(phone);
      }
    });

    // 5. Extract phone numbers from visible text
    const textPhones = text.match(this.PHONE_REGEX) || [];
    allPhones.push(...textPhones);

    // Clean and deduplicate emails
    const cleanedEmails = [...new Set(allEmails)]
      .map((email) => this.cleanEmail(email))
      .filter((email) => this.isValidEmail(email))
      .filter((email) => !this.isGenericEmail(email));

    // Prioritize emails: info@ and contact@ first, then others
    const bestEmail = this.selectBestEmail(cleanedEmails);

    // Clean and deduplicate phones
    const validPhones = [...new Set(allPhones)]
      .filter((phone) => this.isValidPhone(phone));

    return {
      email: bestEmail,
      phone: validPhones[0] || null,
    };
  }

  /**
   * Select the best email from a list of valid emails
   * Prioritize: info@, contact@, hello@, admin@, then others
   */
  private selectBestEmail(emails: string[]): string | null {
    if (emails.length === 0) return null;
    if (emails.length === 1) return emails[0];

    // Define priority prefixes
    const priorities = [
      'info@',
      'contact@',
      'hello@',
      'admin@',
      'support@',
      'sales@',
      'office@',
      'frontdesk@',
    ];

    // Find first email matching priority order
    for (const prefix of priorities) {
      const match = emails.find(email => email.toLowerCase().startsWith(prefix));
      if (match) return match;
    }

    // Return first email if no priority match
    return emails[0];
  }

  /**
   * Clean up extracted email by removing trailing non-email characters
   */
  private cleanEmail(email: string): string {
    // Remove common trailing characters that get captured (Opening, Hours, etc.)
    // Match only the valid email part
    const match = email.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return match ? match[0] : email;
  }

  /**
   * Validate email address
   */
  private isValidEmail(email: string): boolean {
    return (
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      !email.includes('@example.') &&
      !email.includes('@test.')
    );
  }

  /**
   * Check if email is generic/not useful
   */
  private isGenericEmail(email: string): boolean {
    const lowerEmail = email.toLowerCase();

    // Only filter out truly generic/automated emails
    const genericPatterns = [
      'noreply',
      'no-reply',
      'donotreply',
      'do-not-reply',
      'example.com',
      'test.com',
      'support@example',
      'info@example',
      'contact@example',
    ];

    return genericPatterns.some((pattern) => lowerEmail.includes(pattern));
  }

  /**
   * Validate phone number (basic check)
   */
  private isValidPhone(phone: string): boolean {
    // Remove formatting
    const digits = phone.replace(/\D/g, '');
    // Phone should have 10-15 digits
    return digits.length >= 10 && digits.length <= 15;
  }

  /**
   * Build URL with protocol
   */
  private buildUrl(domain: string, path: string = ''): string {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${cleanDomain}${path}`;
  }

  /**
   * Classify scraping error
   */
  private classifyError(error: any): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === 'ENOTFOUND') {
        return 'DOMAIN_NOT_FOUND';
      }

      if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
        return 'TIMEOUT';
      }

      if (axiosError.response?.status === 403 || axiosError.response?.status === 401) {
        return 'ACCESS_DENIED';
      }

      if (axiosError.response?.status === 404) {
        return 'PAGE_NOT_FOUND';
      }

      if (axiosError.response?.status && axiosError.response.status >= 500) {
        return 'SERVER_ERROR';
      }
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Scrape multiple domains in parallel
   */
  async scrapeDomains(
    domains: DomainToScrape[],
    options: ScrapingOptions = {}
  ): Promise<ScrapedDomain[]> {
    const {
      concurrency = 10, // Scrape 10 domains at a time
      batchSize = 100,
      timeout = 3000, // Reduced from 10000ms to 3000ms
      usePuppeteerFallback = true, // Enable Puppeteer fallback by default
      onProgress,
      onError,
    } = options;

    // Clear failed domains set at the start of a new scraping session
    this.failedDomains.clear();

    console.log(`[DomainScraperService] Starting scraping of ${domains.length} domains`);
    console.log(`[DomainScraperService] Concurrency: ${concurrency}, Batch size: ${batchSize}`);

    const results = await processBatch(
      domains,
      async (domain) => {
        const result = await this.scrapeDomain(domain.domain, { timeout, usePuppeteerFallback });
        return {
          ...domain,
          result,
        };
      },
      {
        concurrency,
        batchSize,
        onProgress: onProgress
          ? (completed, total) => {
              onProgress(completed, total);
              if (completed % 25 === 0 || completed === total) {
                console.log(
                  `[DomainScraperService] Progress: ${completed}/${total} domains scraped`
                );
              }
            }
          : undefined,
        onError: (error, domain) => {
          logError(error, {
            domain: domain.domain,
            businessName: domain.businessName,
          });
          if (onError) {
            onError(error, domain);
          }
        },
      }
    );

    console.log(`[DomainScraperService] Completed scraping of ${results.length} domains`);

    return results;
  }

  /**
   * Get scraping statistics
   */
  getScrapingStats(scraped: ScrapedDomain[]): {
    total: number;
    withEmail: number;
    withPhone: number;
    withBoth: number;
    errors: Record<string, number>;
  } {
    const withEmail = scraped.filter((d) => d.result.email !== null);
    const withPhone = scraped.filter((d) => d.result.phone !== null);
    const withBoth = scraped.filter((d) => d.result.email && d.result.phone);

    const errors: Record<string, number> = {};
    scraped.forEach((d) => {
      if (d.result.error) {
        errors[d.result.error] = (errors[d.result.error] || 0) + 1;
      }
    });

    return {
      total: scraped.length,
      withEmail: withEmail.length,
      withPhone: withPhone.length,
      withBoth: withBoth.length,
      errors,
    };
  }
}

// Export singleton instance
export const domainScraperService = new DomainScraperService();

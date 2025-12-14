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
    const { timeout = 5000, usePuppeteerFallback = false } = options;

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
          // If first page (home page) fails with a persistent error, mark domain as failed
          if (path === '') {
            const isPersistentError = this.isPersistentError(error);
            if (isPersistentError) {
              console.log(`[DomainScraper] Persistent error on ${domain} home page - marking for exclusion`);
              firstPageFailed = true;
              this.failedDomains.add(domain);
              throw error; // Throw to exit and return error
            }
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
          const puppeteerResult = await puppeteerScraperService.scrapeDomain(domain, { timeout: 3000 });
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

      // Try Puppeteer fallback if enabled and error is not persistent
      // Skip Puppeteer for timeouts and 403s - they'll fail the same way
      const shouldSkipPuppeteer =
        errorMessage === 'TIMEOUT' ||
        errorMessage === 'ACCESS_DENIED' ||
        errorMessage === 'DOMAIN_NOT_FOUND' ||
        errorMessage === 'SERVER_ERROR';

      if (usePuppeteerFallback && !shouldSkipPuppeteer) {
        console.log(`[DomainScraper] Cheerio error for ${domain}, trying Puppeteer fallback...`);
        try {
          const puppeteerResult = await puppeteerScraperService.scrapeDomain(domain, { timeout: 3000 });
          if (puppeteerResult.email || puppeteerResult.phone) {
            console.log(`[DomainScraper] Puppeteer recovered from Cheerio error for ${domain}`);
            return puppeteerResult;
          }
        } catch (puppeteerError) {
          console.log(`[DomainScraper] Puppeteer also failed for ${domain}`);
          // Fall through to return original error
        }
      } else if (shouldSkipPuppeteer) {
        console.log(`[DomainScraper] Skipping Puppeteer for ${domain} - persistent error: ${errorMessage}`);
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

    // 4. Extract phone numbers from tel: links (MOST RELIABLE)
    const telPhones: string[] = [];
    $('a[href^="tel:"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        const phone = href.replace('tel:', '').trim();
        telPhones.push(phone);
      }
    });

    // 5. Extract phone numbers from visible text (LESS RELIABLE - use as fallback)
    const textPhones = text.match(this.PHONE_REGEX) || [];

    // Clean and deduplicate emails
    const cleanedEmails = [...new Set(allEmails)]
      .map((email) => this.cleanEmail(email))
      .filter((email) => this.isValidEmail(email))
      .filter((email) => !this.isGenericEmail(email));

    // Prioritize emails: info@ and contact@ first, then others
    const bestEmail = this.selectBestEmail(cleanedEmails);

    // Prioritize tel: link phones over text-extracted phones
    // Clean and validate tel: phones first
    const validTelPhones = [...new Set(telPhones)]
      .filter((phone) => this.isValidPhone(phone))
      .map((phone) => this.normalizePhone(phone));

    // Only use text phones if no tel: links found
    let bestPhone = validTelPhones[0] || null;
    if (!bestPhone) {
      const validTextPhones = [...new Set(textPhones)]
        .filter((phone) => this.isValidPhone(phone))
        .map((phone) => this.normalizePhone(phone));
      bestPhone = validTextPhones[0] || null;
    }

    return {
      email: bestEmail,
      phone: bestPhone,
    };
  }

  /**
   * Select the best email from a list of valid emails
   * Prioritize: info@, contact@, hello@, admin@, then others
   */
  private selectBestEmail(emails: string[]): string | null {
    if (emails.length === 0) return null;
    if (emails.length === 1) return emails[0].toLowerCase(); // Normalize to lowercase

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
      if (match) return match.toLowerCase(); // Normalize to lowercase
    }

    // Return first email if no priority match (normalized to lowercase)
    return emails[0].toLowerCase();
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
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return false;
    }

    // Exclude test/example emails
    if (email.includes('@example.') || email.includes('@test.')) {
      return false;
    }

    // Exclude image files and assets (img-header@2x.png, slide@2x.jpg, etc.)
    const lowerEmail = email.toLowerCase();
    if (lowerEmail.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|ttf|eot)$/)) {
      return false;
    }

    // Exclude emails that look like file paths or assets
    if (lowerEmail.includes('img-') || lowerEmail.includes('image-') || lowerEmail.includes('slide-')) {
      return false;
    }

    // Domain part should not contain @ (catches things like img@2x in filename)
    const parts = email.split('@');
    if (parts.length !== 2) {
      return false;
    }

    const [localPart, domain] = parts;

    // Exclude MD5-like hashes (32 hex chars) or other long hex strings
    if (localPart.match(/^[a-f0-9]{20,}$/i)) {
      return false;
    }

    // Local part should not be empty and should not contain file extension patterns
    if (!localPart || localPart.match(/\d+x\.(png|jpg)/i)) {
      return false;
    }

    // Domain should have proper TLD (at least 2 chars after last dot)
    const domainParts = domain.split('.');
    if (domainParts.length < 2) {
      return false;
    }

    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2 || tld.match(/\d+/)) { // TLD shouldn't have numbers
      return false;
    }

    return true;
  }

  /**
   * Check if email is generic/not useful
   */
  private isGenericEmail(email: string): boolean {
    const lowerEmail = email.toLowerCase();

    // Filter out truly generic/automated/dummy emails
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
      'user@domain.com',
      'admin@domain.com',
      'email@domain.com',
      'name@domain.com',
      'your@domain.com',
      'youremail@',
      'yourname@',
      'user@',
      'username@',
    ];

    return genericPatterns.some((pattern) => lowerEmail.includes(pattern));
  }

  /**
   * Validate phone number (US numbers only)
   */
  private isValidPhone(phone: string): boolean {
    // Remove all formatting
    const digits = phone.replace(/\D/g, '');

    // Must be exactly 10 digits (US) or 11 digits starting with 1 (US with country code)
    if (digits.length === 10) {
      // First digit can't be 0 or 1 (valid US area codes)
      return digits[0] >= '2' && digits[0] <= '9';
    } else if (digits.length === 11 && digits[0] === '1') {
      // Country code 1, area code can't start with 0 or 1
      return digits[1] >= '2' && digits[1] <= '9';
    }

    // Reject everything else (wrong length or invalid country code)
    return false;
  }

  /**
   * Normalize phone number to standard US format
   * Output: (XXX) XXX-XXXX
   */
  private normalizePhone(phone: string): string {
    // Extract only digits
    const digits = phone.replace(/\D/g, '');

    // US phone number with 10 digits
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    // US phone number with country code (11 digits starting with 1)
    if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }

    // Should never reach here due to isValidPhone check, but just in case
    return phone;
  }

  /**
   * Build URL with protocol
   */
  private buildUrl(domain: string, path: string = ''): string {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${cleanDomain}${path}`;
  }

  /**
   * Check if an error is persistent (will fail on all pages)
   */
  private isPersistentError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // Domain not found
      if (axiosError.code === 'ENOTFOUND') {
        return true;
      }

      // Timeout errors
      if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
        return true;
      }

      // Connection refused/reset
      if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ECONNRESET') {
        return true;
      }

      // Access denied (403, 401) - site is blocking us
      if (axiosError.response?.status === 403 || axiosError.response?.status === 401) {
        return true;
      }

      // 404 on home page means domain/site doesn't exist properly
      if (axiosError.response?.status === 404) {
        return true;
      }

      // 5xx errors often indicate misconfigured sites
      if (axiosError.response?.status && axiosError.response.status >= 500) {
        return true;
      }
    }

    return false;
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
      concurrency = 5, // 5 concurrent pages in shared browser
      batchSize = 100,
      timeout = 5000, // 5 second timeout for HTTP requests
      usePuppeteerFallback = true, // Enable Puppeteer fallback by default
      onProgress,
      onError,
    } = options;

    // Clear failed domains set at the start of a new scraping session
    this.failedDomains.clear();

    console.log(`[DomainScraperService] Starting scraping of ${domains.length} domains`);
    console.log(`[DomainScraperService] Concurrency: ${concurrency}, Batch size: ${batchSize}`);
    if (usePuppeteerFallback) {
      console.log(`[DomainScraperService] Puppeteer fallback enabled - will use shared browser instance for all domains`);
    }

    try {
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
    } finally {
      // Always close shared browser after batch completes
      if (usePuppeteerFallback) {
        console.log(`[DomainScraperService] Closing shared Puppeteer browser after batch...`);
        await puppeteerScraperService.closeSharedBrowser();
      }
    }
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

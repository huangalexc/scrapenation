import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { logError } from '../utils/errors';

// Detect if we're in production or development
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;

export interface PuppeteerScrapingResult {
  email: string | null;
  phone: string | null;
  error: string | null;
}

export class PuppeteerScraperService {
  private readonly EMAIL_REGEX =
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g;
  private readonly PHONE_REGEX =
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

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
  ];

  /**
   * Track domains that have timed out to skip them in future attempts
   */
  private timeoutDomains = new Set<string>();

  /**
   * Scrape a domain using headless browser (for JavaScript-rendered content)
   */
  async scrapeDomain(
    domain: string,
    options: { timeout?: number } = {}
  ): Promise<PuppeteerScrapingResult> {
    const { timeout = 10000 } = options;

    // Skip domains that have previously timed out
    if (this.timeoutDomains.has(domain)) {
      console.log(`[PuppeteerScraper] Skipping ${domain} - previously timed out`);
      return {
        email: null,
        phone: null,
        error: 'DOMAIN_TIMEOUT_SKIP',
      };
    }

    let browser;
    let hasTimedOut = false;

    try {
      console.log(`[PuppeteerScraper] Starting browser for ${domain} (${isProduction ? 'production' : 'development'} mode)`);

      // Launch browser with retry logic (handles ETXTBSY errors on Railway)
      browser = await this.launchBrowserWithRetry();
      if (!browser) {
        throw new Error('Failed to launch browser after retries');
      }

      const page = await browser.newPage();

      // Set user agent to avoid detection
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Try multiple contact pages
      for (const path of this.CONTACT_PATHS) {
        const url = this.buildUrl(domain, path);

        try {
          console.log(`[PuppeteerScraper] Checking ${url}`);

          await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout,
          });

          // Wait a bit for any lazy-loaded content
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Extract page content
          const content = await page.content();
          const result = this.extractContactInfo(content);

          // If we found something, return it
          if (result.email || result.phone) {
            console.log(`[PuppeteerScraper] Found contact info on ${path || 'home page'}`);
            await browser.close();
            return { ...result, error: null };
          }
        } catch (error) {
          const errorMessage = (error as Error).message;
          console.log(`[PuppeteerScraper] Error on ${path}:`, errorMessage);

          // Check if this is a timeout error
          if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
            console.log(`[PuppeteerScraper] Timeout detected for ${domain} - marking for exclusion and stopping`);
            hasTimedOut = true;
            this.timeoutDomains.add(domain);
            break; // Stop trying other paths for this domain
          }

          // Continue to next path for other errors
          if (path === '') {
            // If home page fails (non-timeout), we should still try contact pages
            continue;
          }
          continue;
        }
      }

      await browser.close();

      // If we stopped due to timeout, return timeout error
      if (hasTimedOut) {
        return {
          email: null,
          phone: null,
          error: 'NAVIGATION_TIMEOUT',
        };
      }

      // No contact info found on any page
      return {
        email: null,
        phone: null,
        error: 'NO_CONTACT_INFO_FOUND',
      };
    } catch (error) {
      if (browser) {
        await browser.close().catch(() => {});
      }

      logError(error as Error, { domain, service: 'PuppeteerScraper' });

      return {
        email: null,
        phone: null,
        error: 'PUPPETEER_ERROR',
      };
    }
  }

  /**
   * Launch browser with retry logic to handle resource exhaustion on Railway
   */
  private async launchBrowserWithRetry(maxRetries = 3): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add delay between attempts to stagger browser launches
        if (attempt > 1) {
          const waitTime = attempt * 1000; // 1s, 2s, 3s
          console.log(`[PuppeteerScraper] Waiting ${waitTime}ms before retry attempt ${attempt}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        if (isProduction) {
          // Production: Use Lambda-compatible Chromium
          return await puppeteer.launch({
            args: [...chromium.args, '--single-process'], // Add single-process flag for Railway
            defaultViewport: {
              width: 1920,
              height: 1080,
            },
            executablePath: await chromium.executablePath(),
            headless: true,
          });
        } else {
          // Development: Use local Chromium from puppeteer package
          console.log(`[PuppeteerScraper] Using local Chromium in development mode`);
          const puppeteerFull = await import('puppeteer');
          return await puppeteerFull.default.launch({
            headless: true,
            defaultViewport: {
              width: 1920,
              height: 1080,
            },
          });
        }
      } catch (error) {
        const errorMessage = (error as Error).message;

        console.log(`[PuppeteerScraper] Browser launch failed (attempt ${attempt}/${maxRetries}): ${errorMessage}`);

        // Retry on ANY launch failure if we have retries left
        if (attempt < maxRetries) {
          continue;
        }

        // Max retries reached, throw the error
        throw error;
      }
    }

    return null;
  }

  /**
   * Extract contact information from HTML content
   */
  private extractContactInfo(html: string): { email: string | null; phone: string | null } {
    const allEmails: string[] = [];
    const allPhones: string[] = [];

    // Extract emails from mailto: links
    const mailtoMatches = html.matchAll(/mailto:([^"'\s?]+)/gi);
    for (const match of mailtoMatches) {
      allEmails.push(match[1]);
    }

    // Extract emails from text content
    const textEmails = html.match(this.EMAIL_REGEX) || [];
    allEmails.push(...textEmails);

    // Extract phone numbers from tel: links
    const telMatches = html.matchAll(/tel:([^"'\s]+)/gi);
    for (const match of telMatches) {
      allPhones.push(match[1]);
    }

    // Extract phone numbers from text
    const textPhones = html.match(this.PHONE_REGEX) || [];
    allPhones.push(...textPhones);

    // Clean and deduplicate emails
    const cleanedEmails = [...new Set(allEmails)]
      .map((email) => this.cleanEmail(email))
      .filter((email) => this.isValidEmail(email))
      .filter((email) => !this.isGenericEmail(email));

    // Prioritize emails
    const bestEmail = this.selectBestEmail(cleanedEmails);

    // Clean and deduplicate phones
    const validPhones = [...new Set(allPhones)].filter((phone) =>
      this.isValidPhone(phone)
    );

    return {
      email: bestEmail,
      phone: validPhones[0] || null,
    };
  }

  /**
   * Select the best email from a list of valid emails
   */
  private selectBestEmail(emails: string[]): string | null {
    if (emails.length === 0) return null;
    if (emails.length === 1) return emails[0];

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

    for (const prefix of priorities) {
      const match = emails.find((email) => email.toLowerCase().startsWith(prefix));
      if (match) return match;
    }

    return emails[0];
  }

  /**
   * Clean up extracted email
   */
  private cleanEmail(email: string): string {
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
   * Validate phone number
   */
  private isValidPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  /**
   * Build URL with protocol
   */
  private buildUrl(domain: string, path: string = ''): string {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${cleanDomain}${path}`;
  }
}

// Export singleton instance
export const puppeteerScraperService = new PuppeteerScraperService();

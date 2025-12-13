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
   * Scrape a domain using headless browser (for JavaScript-rendered content)
   */
  async scrapeDomain(
    domain: string,
    options: { timeout?: number } = {}
  ): Promise<PuppeteerScrapingResult> {
    const { timeout = 10000 } = options;

    let browser;
    try {
      console.log(`[PuppeteerScraper] Starting browser for ${domain} (${isProduction ? 'production' : 'development'} mode)`);

      // Launch browser with environment-specific settings
      if (isProduction) {
        // Production: Use Lambda-compatible Chromium
        browser = await puppeteer.launch({
          args: chromium.args,
          defaultViewport: {
            width: 1920,
            height: 1080,
          },
          executablePath: await chromium.executablePath(),
          headless: true,
        });
      } else {
        // Development: Skip Puppeteer (not configured for local use)
        console.log(`[PuppeteerScraper] Skipping Puppeteer in development - would require full puppeteer package`);
        return {
          email: null,
          phone: null,
          error: 'PUPPETEER_DEV_SKIP',
        };
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
          await page.waitForTimeout(1000);

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
          console.log(`[PuppeteerScraper] Error on ${path}:`, (error as Error).message);
          // Continue to next path if this one fails
          if (path === '') {
            // If home page fails, we should still try contact pages
            continue;
          }
          continue;
        }
      }

      await browser.close();

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

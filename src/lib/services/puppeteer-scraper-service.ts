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
  // Email regex with proper boundaries to avoid capturing surrounding text
  private readonly EMAIL_REGEX =
    /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9._%+-])/gi;
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
   * Track domains that have failed (timeout, DNS error, etc.) to skip them in future attempts
   */
  private failedDomains = new Set<string>();

  /**
   * Shared browser instance for batch processing (reuse instead of launching per domain)
   */
  private sharedBrowser: any = null;

  /**
   * Get or create a shared browser instance
   */
  private async getSharedBrowser() {
    if (!this.sharedBrowser) {
      console.log(`[PuppeteerScraper] Launching shared browser instance...`);
      this.sharedBrowser = await this.launchBrowserWithRetry();
      if (!this.sharedBrowser) {
        throw new Error('Failed to launch shared browser after retries');
      }
    }
    return this.sharedBrowser;
  }

  /**
   * Close the shared browser instance
   */
  async closeSharedBrowser() {
    if (this.sharedBrowser) {
      console.log(`[PuppeteerScraper] Closing shared browser instance...`);
      try {
        await this.sharedBrowser.close();
      } catch (error) {
        console.log(`[PuppeteerScraper] Error closing browser, will force kill:`, (error as Error).message);
      }
      this.sharedBrowser = null;

      // Force kill any remaining Chrome processes to prevent zombie processes
      if (process.platform !== 'win32') {
        try {
          const { execSync } = require('child_process');
          execSync('pkill -9 -f "chrome|chromium"', { stdio: 'ignore' });
          console.log(`[PuppeteerScraper] Forcefully killed any remaining Chrome processes`);
        } catch (killError) {
          // Ignore errors - processes might already be dead
        }
      }
    }
  }

  /**
   * Scrape a domain using headless browser (for JavaScript-rendered content)
   */
  async scrapeDomain(
    domain: string,
    options: { timeout?: number } = {}
  ): Promise<PuppeteerScrapingResult> {
    const { timeout = 10000 } = options;

    // Skip domains that have previously failed
    if (this.failedDomains.has(domain)) {
      console.log(`[PuppeteerScraper] Skipping ${domain} - previously failed`);
      return {
        email: null,
        phone: null,
        error: 'DOMAIN_PREVIOUSLY_FAILED',
      };
    }

    let hasFailed = false;
    let failureReason = 'PUPPETEER_ERROR';

    try {
      console.log(`[PuppeteerScraper] Scraping ${domain} (${isProduction ? 'production' : 'development'} mode)`);

      // Get shared browser instance (reuse instead of launching new one)
      const browser = await this.getSharedBrowser();

      const page = await browser.newPage();

      // Set user agent to avoid detection
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Try first path to detect persistent errors
      const firstPath = this.CONTACT_PATHS[0];
      const firstUrl = this.buildUrl(domain, firstPath);

      try {
        console.log(`[PuppeteerScraper] Checking ${firstUrl}`);

        await page.goto(firstUrl, {
          waitUntil: 'networkidle0',
          timeout,
        });

        // Wait a bit for any lazy-loaded content
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Extract page content
        const content = await page.content();
        const result = this.extractContactInfo(content);

        // If we found something on first page, return it
        if (result.email || result.phone) {
          console.log(`[PuppeteerScraper] Found contact info on ${firstPath || 'home page'}`);
          await page.close(); // Close page but keep browser open
          return { ...result, error: null };
        }
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.log(`[PuppeteerScraper] Error on ${firstPath}:`, errorMessage);

        // Check for persistent errors that will affect all paths
        if (errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('ERR_CONNECTION_REFUSED') ||
            errorMessage.includes('ERR_CONNECTION_RESET') ||
            errorMessage.includes('ERR_SSL_VERSION_OR_CIPHER_MISMATCH') ||
            errorMessage.includes('ERR_SSL_PROTOCOL_ERROR') ||
            errorMessage.includes('EPROTO') ||
            errorMessage.includes('ssl/tls alert')) {
          console.log(`[PuppeteerScraper] DNS/Connection/SSL error for ${domain} - marking for exclusion`);
          hasFailed = true;
          failureReason = 'DNS_OR_CONNECTION_ERROR';
          this.failedDomains.add(domain);
        } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
          console.log(`[PuppeteerScraper] Timeout detected for ${domain} - marking for exclusion`);
          hasFailed = true;
          failureReason = 'NAVIGATION_TIMEOUT';
          this.failedDomains.add(domain);
        }

        // If it's a persistent error, don't try other paths
        if (hasFailed) {
          await page.close(); // Close page but keep browser open
          return {
            email: null,
            phone: null,
            error: failureReason,
          };
        }
      }

      // Try remaining contact pages (only if first page didn't have persistent error)
      for (let i = 1; i < this.CONTACT_PATHS.length; i++) {
        const path = this.CONTACT_PATHS[i];
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
            console.log(`[PuppeteerScraper] Found contact info on ${path}`);
            await page.close(); // Close page but keep browser open
            return { ...result, error: null };
          }
        } catch (error) {
          const errorMessage = (error as Error).message;
          console.log(`[PuppeteerScraper] Error on ${path}:`, errorMessage);
          // Continue to next path for non-persistent errors on subsequent pages
          continue;
        }
      }

      await page.close(); // Close page but keep browser open

      // No contact info found on any page
      return {
        email: null,
        phone: null,
        error: 'NO_CONTACT_INFO_FOUND',
      };
    } catch (error) {
      // Don't close browser on error - it's shared across domains
      // Just log the error and continue
      const errorMessage = (error as Error).message;
      console.log(`[PuppeteerScraper] Error for ${domain}: ${errorMessage}`);
      logError(error as Error, { domain, service: 'PuppeteerScraper' });

      return {
        email: null,
        phone: null,
        error: errorMessage.substring(0, 100), // Return first 100 chars of error
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
          // Production: Use Lambda-compatible Chromium with aggressive resource limits
          const minimalArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process', // Most important - run Chrome in single process mode
            '--no-zygote', // Don't use zygote process (reduces process count)
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-extensions-with-background-pages',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            '--disable-ipc-flooding-protection',
            '--disable-renderer-backgrounding',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--disable-hang-monitor', // Don't spawn hang monitor thread
            '--disable-prompt-on-repost',
            '--disable-sync',
          ];

          // Get Chromium executable path for serverless
          // @sparticuz/chromium handles decompression automatically in AWS Lambda/Vercel
          const executablePath = await chromium.executablePath();

          return await puppeteer.launch({
            args: chromium.args.concat(minimalArgs),
            defaultViewport: chromium.defaultViewport,
            executablePath,
            headless: chromium.headless,
          });
        } else {
          // Development: Use puppeteer-core with system Chrome
          console.log(`[PuppeteerScraper] Using puppeteer-core in development mode`);
          return await puppeteer.launch({
            headless: true,
            executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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

    // Extract phone numbers from tel: links (MOST RELIABLE)
    const telPhones: string[] = [];
    const telMatches = html.matchAll(/tel:([^"'\s]+)/gi);
    for (const match of telMatches) {
      telPhones.push(match[1]);
    }

    // Extract phone numbers from text (LESS RELIABLE - use as fallback)
    const textPhones = html.match(this.PHONE_REGEX) || [];

    // Clean and deduplicate emails
    const cleanedEmails = [...new Set(allEmails)]
      .map((email) => this.cleanEmail(email))
      .filter((email) => this.isValidEmail(email))
      .filter((email) => !this.isGenericEmail(email));

    // Prioritize emails
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
   */
  private selectBestEmail(emails: string[]): string | null {
    if (emails.length === 0) return null;
    if (emails.length === 1) return emails[0].toLowerCase(); // Normalize to lowercase

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
      if (match) return match.toLowerCase(); // Normalize to lowercase
    }

    return emails[0].toLowerCase();
  }

  /**
   * Clean up extracted email by removing leading/trailing non-email characters
   */
  private cleanEmail(email: string): string {
    // First, decode URL-encoded characters like %20 (space)
    let cleaned = email;
    try {
      cleaned = decodeURIComponent(email);
    } catch {
      // If decoding fails, use original
    }

    // Remove spaces that might be in the middle of the email first
    // e.g., "naylorclinic@be llsouth.net" -> "naylorclinic@bellsouth.net"
    cleaned = cleaned.replace(/\s+/g, '');

    // Extract ONLY the email part, ensuring:
    // 1. Local part starts with a letter (not digit/symbol)
    // 2. Domain ends with a known TLD (com, net, org, etc.)
    // This handles cases like:
    // - "704-568-2447admin@chirobryan.com" -> "admin@chirobryan.com"
    // - "info@example.comcall" -> "info@example.com"
    // - "drguglielmo@gmail.comphone" -> "drguglielmo@gmail.com"
    // - "filler@godaddy.combookingsmy" -> "filler@godaddy.com"
    // - "naylorclinic@bellsouth.netnaylorstaff" -> "naylorclinic@bellsouth.net"
    const match = cleaned.match(
      /[A-Za-z][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.(?:com|net|org|edu|gov|mil|co|io|us|uk|ca|au|de|fr|it|es|nl|be|ch|at|se|no|dk|fi|pl|cz|ru|jp|cn|in|br|mx|ar|cl|pe|nz|za|info|biz|name|mobi|pro|aero|asia|cat|coop|jobs|museum|tel|travel|xxx)/
    );
    if (!match) return email;

    return match[0];
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
      '@godaddy.com', // GoDaddy placeholder emails
      'filler@',
      'placeholder@',
      'dummy@',
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
}

// Export singleton instance
export const puppeteerScraperService = new PuppeteerScraperService();

import { promises as dnsPromises } from 'dns';
import { withRetry } from '../utils/retry';
import { processBatch } from '../utils/batch';
import type {
  EmailVerificationResult,
  EmailVerificationStatus,
  EmailVerificationDetails,
  EmailToVerify,
} from '../types/scraping';

export interface VerificationOptions {
  concurrency?: number;
  batchSize?: number;
  timeout?: number;
  checkDisposable?: boolean;
  onProgress?: (completed: number, total: number) => void;
  onError?: (error: Error, email: EmailToVerify) => void;
}

/**
 * Service for verifying scraped email addresses
 * Performs DNS/MX record validation to ensure emails are deliverable
 */
export class ScrapedEmailVerificationService {
  /**
   * List of known disposable email domains
   * Source: https://github.com/disposable/disposable-email-domains
   */
  private readonly DISPOSABLE_DOMAINS = new Set([
    'tempmail.com',
    'guerrillamail.com',
    'mailinator.com',
    '10minutemail.com',
    'throwaway.email',
    'getnada.com',
    'temp-mail.org',
    'yopmail.com',
    'maildrop.cc',
    'trashmail.com',
    'fakeinbox.com',
    'sharklasers.com',
    'dispostable.com',
    'temp-mail.io',
    'mohmal.com',
    'emailondeck.com',
    'spamgourmet.com',
    'mintemail.com',
    'mytemp.email',
    'gmx.com', // Often used for spam
  ]);

  /**
   * Domain MX record cache to avoid redundant DNS lookups
   * Cache TTL: 1 hour (MX records rarely change)
   */
  private domainMxCache = new Map<string, { records: string[]; timestamp: number }>();
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds

  /**
   * Verify a single email address
   */
  async verifyEmail(email: string): Promise<EmailVerificationResult> {
    const details: EmailVerificationDetails = {
      syntax: false,
      hasMxRecords: false,
      isDisposable: false,
      isCatchAll: null,
      smtpCheck: 'unknown', // We'll implement SMTP later
      verificationDate: new Date().toISOString(),
    };

    try {
      // Step 1: Syntax validation
      details.syntax = this.validateSyntax(email);
      if (!details.syntax) {
        return {
          email,
          verified: false,
          status: 'invalid',
          details: {
            ...details,
            error: 'Invalid email syntax',
          },
        };
      }

      // Extract domain
      const domain = email.split('@')[1].toLowerCase();

      // Step 2: Check for disposable email
      details.isDisposable = this.isDisposableEmail(domain);
      if (details.isDisposable) {
        return {
          email,
          verified: false,
          status: 'risky',
          details: {
            ...details,
            error: 'Disposable email address',
          },
        };
      }

      // Step 3: DNS/MX Record validation
      const mxRecords = await this.checkMxRecords(domain);
      details.hasMxRecords = mxRecords.length > 0;
      details.mxRecords = mxRecords;

      if (!details.hasMxRecords) {
        return {
          email,
          verified: false,
          status: 'invalid',
          details: {
            ...details,
            error: 'No MX records found for domain',
          },
        };
      }

      // Email passed all checks
      return {
        email,
        verified: true,
        status: 'valid',
        details,
      };
    } catch (error) {
      console.error(`[EmailVerification] Error verifying ${email}:`, error);
      return {
        email,
        verified: false,
        status: 'unknown',
        details: {
          ...details,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Verify multiple emails in parallel with concurrency control
   * Uses pre-grouping by domain to minimize DNS lookups
   */
  async verifyEmails(
    emails: EmailToVerify[],
    options: VerificationOptions = {}
  ): Promise<Map<string, EmailVerificationResult>> {
    const {
      concurrency = 10, // 10 concurrent DNS lookups
      batchSize = 100,
      onProgress,
      onError,
    } = options;

    console.log(`[EmailVerification] Starting verification of ${emails.length} emails`);
    console.log(`[EmailVerification] Concurrency: ${concurrency}, Batch size: ${batchSize}`);

    // Pre-group emails by domain to optimize DNS lookups
    const emailsByDomain = new Map<string, EmailToVerify[]>();
    const invalidSyntaxEmails: EmailToVerify[] = [];

    emails.forEach((emailToVerify) => {
      const parts = emailToVerify.email.split('@');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        // Invalid syntax - will be processed separately
        invalidSyntaxEmails.push(emailToVerify);
        return;
      }

      const domain = parts[1].toLowerCase();
      if (!emailsByDomain.has(domain)) {
        emailsByDomain.set(domain, []);
      }
      emailsByDomain.get(domain)!.push(emailToVerify);
    });

    const uniqueDomains = emailsByDomain.size;
    console.log(
      `[EmailVerification] Pre-grouped ${emails.length} emails into ${uniqueDomains} unique domains`
    );
    console.log(
      `[EmailVerification] Optimization: ${emails.length - uniqueDomains} duplicate domain lookups avoided`
    );

    const results = new Map<string, EmailVerificationResult>();

    // First, handle invalid syntax emails (fast, no DNS lookup needed)
    invalidSyntaxEmails.forEach((emailToVerify) => {
      const result: EmailVerificationResult = {
        email: emailToVerify.email,
        verified: false,
        status: 'invalid',
        details: {
          syntax: false,
          hasMxRecords: false,
          isDisposable: false,
          isCatchAll: null,
          smtpCheck: 'unknown',
          verificationDate: new Date().toISOString(),
          error: 'Invalid email syntax',
        },
      };
      results.set(emailToVerify.id, result);
    });

    // Convert domain groups to array for batch processing
    const domainGroups = Array.from(emailsByDomain.entries());

    // Process domains with concurrency control
    let processedEmails = invalidSyntaxEmails.length;
    await processBatch(
      domainGroups,
      async ([domain, emailsInDomain]) => {
        // Verify one email from this domain (triggers DNS lookup + caching)
        const firstEmail = emailsInDomain[0];
        const result = await this.verifyEmail(firstEmail.email);
        results.set(firstEmail.id, result);

        // Apply same result to all other emails from this domain
        // (they'll use cached DNS result)
        for (let i = 1; i < emailsInDomain.length; i++) {
          const emailToVerify = emailsInDomain[i];
          const duplicateResult = await this.verifyEmail(emailToVerify.email);
          results.set(emailToVerify.id, duplicateResult);
        }

        processedEmails += emailsInDomain.length;

        // Report progress
        if (onProgress) {
          onProgress(processedEmails, emails.length);
        }

        return result;
      },
      {
        concurrency,
        batchSize,
        onProgress: onProgress
          ? (completed, total) => {
              if (completed % 10 === 0 || completed === total) {
                console.log(
                  `[EmailVerification] Progress: ${completed}/${total} domains verified (${processedEmails}/${emails.length} emails)`
                );
              }
            }
          : undefined,
        onError: (error, [domain]) => {
          console.error(`[EmailVerification] Error verifying domain ${domain}:`, error);
          if (onError) {
            // Report error for first email in group
            const emailsInDomain = emailsByDomain.get(domain);
            if (emailsInDomain && emailsInDomain.length > 0) {
              onError(error, emailsInDomain[0]);
            }
          }
        },
      }
    );

    console.log(`[EmailVerification] Completed verification of ${results.size} emails`);
    console.log(
      `[EmailVerification] Cache hits: ${this.getCacheStats().hits}, Cache size: ${this.getCacheStats().size}`
    );

    return results;
  }

  /**
   * Validate email syntax
   */
  private validateSyntax(email: string): boolean {
    // RFC 5322 simplified regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return false;
    }

    // Additional checks
    const [localPart, domain] = email.split('@');

    // Local part should not be empty
    if (!localPart || localPart.length === 0) {
      return false;
    }

    // Domain should have at least one dot and proper TLD
    const domainParts = domain.split('.');
    if (domainParts.length < 2) {
      return false;
    }

    // TLD should be at least 2 characters
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2) {
      return false;
    }

    return true;
  }

  /**
   * Check if domain is a known disposable email provider
   */
  private isDisposableEmail(domain: string): boolean {
    return this.DISPOSABLE_DOMAINS.has(domain.toLowerCase());
  }

  /**
   * Check DNS MX records for domain
   * Returns array of MX record hostnames
   * Uses caching to avoid redundant DNS lookups
   */
  private async checkMxRecords(domain: string): Promise<string[]> {
    // Check cache first
    const cached = this.domainMxCache.get(domain);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[EmailVerification] Using cached MX records for ${domain}`);
      return cached.records;
    }

    try {
      const records = await withRetry(
        async () => {
          const mxRecords = await dnsPromises.resolveMx(domain);
          return mxRecords.sort((a, b) => a.priority - b.priority);
        },
        {
          maxAttempts: 2,
          shouldRetry: (error: any) => {
            // Retry on network errors, but not on NXDOMAIN (domain doesn't exist)
            return error.code !== 'ENOTFOUND' && error.code !== 'ENODATA';
          },
          onRetry: (attempt, error) => {
            console.log(
              `[EmailVerification] Retry attempt ${attempt} for MX lookup of ${domain}: ${error.message}`
            );
          },
        }
      );

      const mxRecordsList = records.map((record) => record.exchange);

      // Store in cache
      this.domainMxCache.set(domain, {
        records: mxRecordsList,
        timestamp: Date.now(),
      });

      return mxRecordsList;
    } catch (error: any) {
      // ENODATA means domain exists but has no MX records
      // ENOTFOUND means domain doesn't exist
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        // Cache negative results too (avoid re-querying invalid domains)
        this.domainMxCache.set(domain, {
          records: [],
          timestamp: Date.now(),
        });
        return [];
      }
      // Other DNS errors - don't cache these
      console.error(`[EmailVerification] DNS error for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Get verification statistics
   */
  getVerificationStats(results: Map<string, EmailVerificationResult>): {
    total: number;
    valid: number;
    invalid: number;
    risky: number;
    unknown: number;
    verificationRate: number;
  } {
    const resultsArray = Array.from(results.values());

    const valid = resultsArray.filter((r) => r.status === 'valid').length;
    const invalid = resultsArray.filter((r) => r.status === 'invalid').length;
    const risky = resultsArray.filter((r) => r.status === 'risky').length;
    const unknown = resultsArray.filter((r) => r.status === 'unknown').length;

    return {
      total: resultsArray.length,
      valid,
      invalid,
      risky,
      unknown,
      verificationRate: resultsArray.length > 0 ? (valid / resultsArray.length) * 100 : 0,
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hits: number;
    oldestEntry: number | null;
  } {
    let oldestTimestamp: number | null = null;

    this.domainMxCache.forEach((value) => {
      if (oldestTimestamp === null || value.timestamp < oldestTimestamp) {
        oldestTimestamp = value.timestamp;
      }
    });

    // Calculate approximate cache hits based on cache size
    // (Actual hits would require tracking, this is an estimate)
    const hits = this.domainMxCache.size;

    return {
      size: this.domainMxCache.size,
      hits,
      oldestEntry: oldestTimestamp,
    };
  }

  /**
   * Clear the MX record cache
   * Useful for testing or when you want to force fresh DNS lookups
   */
  clearCache(): void {
    const oldSize = this.domainMxCache.size;
    this.domainMxCache.clear();
    console.log(`[EmailVerification] Cache cleared (${oldSize} entries removed)`);
  }

  /**
   * Clear expired cache entries (older than TTL)
   */
  clearExpiredCache(): void {
    const now = Date.now();
    let removedCount = 0;

    this.domainMxCache.forEach((value, domain) => {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.domainMxCache.delete(domain);
        removedCount++;
      }
    });

    if (removedCount > 0) {
      console.log(`[EmailVerification] Cleared ${removedCount} expired cache entries`);
    }
  }
}

// Export singleton instance
export const scrapedEmailVerificationService = new ScrapedEmailVerificationService();

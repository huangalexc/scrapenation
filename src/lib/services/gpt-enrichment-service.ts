import OpenAI from 'openai';
import { env } from '../config/env';
import { OpenAIError, QuotaExceededError, logError } from '../utils/errors';
import { withRetry, shouldRetryError, isQuotaError } from '../utils/retry';
import type { SERPResult, EnrichmentResult } from '../types/enrichment';

export class GPTEnrichmentService {
  private openai: OpenAI;
  private model: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: env.openai.apiKey,
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!env.openai.apiKey) {
      console.warn('⚠️  OpenAI API key not configured');
    }
  }

  /**
   * Build the prompt for GPT to extract business information
   */
  private buildPrompt(
    businessName: string,
    city: string | null,
    state: string | null,
    serpResults: SERPResult[]
  ): string {
    const location = [city, state].filter(Boolean).join(', ');

    return `You are an expert at extracting business contact information from search results.

Business: ${businessName}${location ? ` in ${location}` : ''}

Search Results:
${serpResults
  .map(
    (result, i) => `
Result ${i + 1}:
Title: ${result.title}
Snippet: ${result.snippet}
URL: ${result.url}
`
  )
  .join('\n')}

Task: Extract the following information with confidence scores (0-100):
1. Domain (website URL) - most likely official website for this business
2. Email address - if found in search results
3. Phone number - if found in search results

For each field, provide a confidence score based on:
- How certain you are this is the correct business (not a similar business)
- How authoritative the source is
- How relevant the information is to this specific location

Respond in JSON format:
{
  "domain": "example.com or null",
  "domainConfidence": 0-100 or null,
  "email": "contact@example.com or null",
  "emailConfidence": 0-100 or null,
  "phone": "+1-555-0100 or null",
  "phoneConfidence": 0-100 or null
}

Important:
- Set null for any field you cannot find or are very unsure about
- Domain should be just the domain name (e.g., "example.com", not "https://example.com")
- Be conservative with confidence scores - only use high scores (>80) when very certain
- Phone numbers should be in standard format with country code if available
- CRITICAL: If the search results are for a business in a DIFFERENT city or state than specified (${location}), return null for all fields and 0 confidence
- Example: If looking for "Vitality Chiropractic" in NC but results show Rochester, MN location → return all nulls
- Only extract information if you are confident the results match the specified location`;
  }

  /**
   * Extract business information from SERP results using GPT
   */
  async extractBusinessInfo(
    businessName: string,
    city: string | null,
    state: string | null,
    serpResults: SERPResult[]
  ): Promise<EnrichmentResult> {
    if (serpResults.length === 0) {
      return {
        domain: null,
        domainConfidence: null,
        email: null,
        emailConfidence: null,
        phone: null,
        phoneConfidence: null,
      };
    }

    try {
      const prompt = this.buildPrompt(businessName, city, state, serpResults);

      const response = await withRetry(
        async () => {
          return await this.openai.chat.completions.create({
            model: this.model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a helpful assistant that extracts structured business contact information from search results. Always respond with valid JSON.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            response_format: { type: 'json_object' },
            temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
            max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
          });
        },
        {
          maxAttempts: 3,
          shouldRetry: (error) => {
            if (isQuotaError(error)) {
              throw new QuotaExceededError('OpenAI API', {
                businessName,
                error: error.message,
              });
            }
            return shouldRetryError(error);
          },
          onRetry: (attempt, error) => {
            console.log(
              `[GPTEnrichmentService] Retry attempt ${attempt} for "${businessName}": ${error.message}`
            );
          },
        }
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new OpenAIError('No content in GPT response');
      }

      const parsed = JSON.parse(content);

      // Validate and sanitize the response
      return {
        domain: this.sanitizeDomain(parsed.domain),
        domainConfidence: this.sanitizeConfidence(parsed.domainConfidence),
        email: this.sanitizeEmail(parsed.email),
        emailConfidence: this.sanitizeConfidence(parsed.emailConfidence),
        phone: this.sanitizePhone(parsed.phone),
        phoneConfidence: this.sanitizeConfidence(parsed.phoneConfidence),
      };
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        throw error;
      }

      logError(error as Error, { businessName, city, state });
      throw new OpenAIError('Failed to extract business information', {
        businessName,
        originalError: (error as Error).message,
      });
    }
  }

  /**
   * Sanitize domain - remove protocol and trailing slashes
   */
  private sanitizeDomain(domain: any): string | null {
    if (!domain || typeof domain !== 'string') return null;

    return domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase()
      .trim() || null;
  }

  /**
   * Sanitize email address
   */
  private sanitizeEmail(email: any): string | null {
    if (!email || typeof email !== 'string') return null;

    const trimmed = email.toLowerCase().trim();
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;

    return trimmed;
  }

  /**
   * Sanitize and normalize phone number (US only)
   */
  private sanitizePhone(phone: any): string | null {
    if (!phone || typeof phone !== 'string') return null;

    // Extract only digits
    const digits = phone.replace(/\D/g, '');

    // Validate US phone number
    let isValid = false;
    if (digits.length === 10) {
      // First digit can't be 0 or 1 (valid US area codes)
      isValid = digits[0] >= '2' && digits[0] <= '9';
    } else if (digits.length === 11 && digits[0] === '1') {
      // Country code 1, area code can't start with 0 or 1
      isValid = digits[1] >= '2' && digits[1] <= '9';
    }

    if (!isValid) return null;

    // Normalize to (XXX) XXX-XXXX format
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }

    return null;
  }

  /**
   * Sanitize confidence score
   */
  private sanitizeConfidence(confidence: any): number | null {
    if (confidence === null || confidence === undefined) return null;

    const num = parseFloat(confidence);
    if (isNaN(num)) return null;

    return Math.max(0, Math.min(100, num));
  }
}

// Export singleton instance
export const gptEnrichmentService = new GPTEnrichmentService();

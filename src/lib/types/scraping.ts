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

// Email verification types
export type EmailVerificationStatus = 'valid' | 'invalid' | 'risky' | 'unknown';

export interface EmailVerificationDetails {
  syntax: boolean; // Passed syntax validation
  hasMxRecords: boolean; // Domain has MX records
  mxRecords?: string[]; // List of MX record hostnames
  isDisposable: boolean; // Known disposable email provider
  isCatchAll: boolean | null; // Domain accepts all emails (null = unknown)
  smtpCheck: 'valid' | 'invalid' | 'unknown' | 'timeout' | 'error'; // SMTP verification result
  smtpCode?: number; // SMTP response code
  verificationDate: string; // ISO timestamp
  error?: string; // Error message if verification failed
}

export interface EmailVerificationResult {
  email: string;
  verified: boolean;
  status: EmailVerificationStatus;
  details: EmailVerificationDetails;
}

export interface EmailToVerify {
  id: string; // Business ID
  email: string;
  emailSource: 'serp' | 'domain'; // Which email field to update
}

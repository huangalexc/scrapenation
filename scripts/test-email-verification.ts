import { scrapedEmailVerificationService } from '../src/lib/services/scraped-email-verification-service';
import type { EmailToVerify } from '../src/lib/types/scraping';

/**
 * Test script to verify email verification service works correctly
 * Run with: npx ts-node scripts/test-email-verification.ts
 */
async function testEmailVerification() {
  console.log('=== Email Verification Service Test ===\n');

  // Test emails with known characteristics
  const testEmails: EmailToVerify[] = [
    {
      id: 'test-1',
      email: 'contact@google.com', // Valid email, has MX records
      emailSource: 'domain',
    },
    {
      id: 'test-2',
      email: 'info@github.com', // Valid email, has MX records
      emailSource: 'domain',
    },
    {
      id: 'test-3',
      email: 'invalid-email', // Invalid syntax
      emailSource: 'serp',
    },
    {
      id: 'test-4',
      email: 'test@tempmail.com', // Disposable email
      emailSource: 'serp',
    },
    {
      id: 'test-5',
      email: 'hello@nonexistentdomain12345.com', // Domain doesn't exist
      emailSource: 'domain',
    },
    {
      id: 'test-6',
      email: 'support@stripe.com', // Valid email, has MX records
      emailSource: 'domain',
    },
  ];

  console.log(`Testing ${testEmails.length} email addresses...\n`);

  const results = await scrapedEmailVerificationService.verifyEmails(testEmails, {
    concurrency: 3,
    batchSize: testEmails.length,
    onProgress: (completed, total) => {
      console.log(`Progress: ${completed}/${total} emails verified`);
    },
  });

  console.log('\n=== Verification Results ===\n');

  results.forEach((result, businessId) => {
    const testEmail = testEmails.find((e) => e.id === businessId);
    console.log(`\n${businessId}: ${testEmail?.email}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Verified: ${result.verified}`);
    console.log(`  Details:`);
    console.log(`    - Syntax valid: ${result.details.syntax}`);
    console.log(`    - Has MX records: ${result.details.hasMxRecords}`);
    if (result.details.mxRecords && result.details.mxRecords.length > 0) {
      console.log(`    - MX records: ${result.details.mxRecords.join(', ')}`);
    }
    console.log(`    - Disposable: ${result.details.isDisposable}`);
    console.log(`    - SMTP check: ${result.details.smtpCheck}`);
    if (result.details.error) {
      console.log(`    - Error: ${result.details.error}`);
    }
  });

  // Show statistics
  console.log('\n=== Statistics ===\n');
  const stats = scrapedEmailVerificationService.getVerificationStats(results);
  console.log(`Total: ${stats.total}`);
  console.log(`Valid: ${stats.valid} (${stats.verificationRate.toFixed(1)}%)`);
  console.log(`Invalid: ${stats.invalid}`);
  console.log(`Risky: ${stats.risky}`);
  console.log(`Unknown: ${stats.unknown}`);

  console.log('\n=== Test Complete ===');
}

// Run the test
testEmailVerification()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

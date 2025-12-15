import { scrapedEmailVerificationService } from '../src/lib/services/scraped-email-verification-service';
import type { EmailToVerify } from '../src/lib/types/scraping';

/**
 * Test script to demonstrate email verification optimizations:
 * 1. Domain-level caching
 * 2. Pre-grouping by domain
 *
 * Run with: npx ts-node scripts/test-email-verification-optimized.ts
 */
async function testOptimizations() {
  console.log('=== Email Verification Optimization Test ===\n');

  // Simulate realistic scenario: 50 emails across 10 unique domains
  // This mimics what happens when scraping businesses (many emails from popular providers)
  const testEmails: EmailToVerify[] = [
    // Gmail (10 emails - most common)
    { id: 'biz-1', email: 'contact@gmail.com', emailSource: 'domain' },
    { id: 'biz-2', email: 'info@gmail.com', emailSource: 'domain' },
    { id: 'biz-3', email: 'support@gmail.com', emailSource: 'domain' },
    { id: 'biz-4', email: 'hello@gmail.com', emailSource: 'domain' },
    { id: 'biz-5', email: 'admin@gmail.com', emailSource: 'domain' },
    { id: 'biz-6', email: 'sales@gmail.com', emailSource: 'domain' },
    { id: 'biz-7', email: 'help@gmail.com', emailSource: 'domain' },
    { id: 'biz-8', email: 'service@gmail.com', emailSource: 'domain' },
    { id: 'biz-9', email: 'team@gmail.com', emailSource: 'domain' },
    { id: 'biz-10', email: 'office@gmail.com', emailSource: 'domain' },

    // Yahoo (8 emails)
    { id: 'biz-11', email: 'contact@yahoo.com', emailSource: 'serp' },
    { id: 'biz-12', email: 'info@yahoo.com', emailSource: 'serp' },
    { id: 'biz-13', email: 'support@yahoo.com', emailSource: 'serp' },
    { id: 'biz-14', email: 'hello@yahoo.com', emailSource: 'serp' },
    { id: 'biz-15', email: 'admin@yahoo.com', emailSource: 'serp' },
    { id: 'biz-16', email: 'sales@yahoo.com', emailSource: 'serp' },
    { id: 'biz-17', email: 'help@yahoo.com', emailSource: 'serp' },
    { id: 'biz-18', email: 'service@yahoo.com', emailSource: 'serp' },

    // Outlook/Hotmail (6 emails)
    { id: 'biz-19', email: 'contact@outlook.com', emailSource: 'domain' },
    { id: 'biz-20', email: 'info@outlook.com', emailSource: 'domain' },
    { id: 'biz-21', email: 'support@outlook.com', emailSource: 'domain' },
    { id: 'biz-22', email: 'hello@hotmail.com', emailSource: 'domain' },
    { id: 'biz-23', email: 'admin@hotmail.com', emailSource: 'domain' },
    { id: 'biz-24', email: 'sales@hotmail.com', emailSource: 'domain' },

    // Corporate domains (5 emails each)
    { id: 'biz-25', email: 'contact@stripe.com', emailSource: 'domain' },
    { id: 'biz-26', email: 'info@stripe.com', emailSource: 'domain' },
    { id: 'biz-27', email: 'support@stripe.com', emailSource: 'domain' },
    { id: 'biz-28', email: 'hello@stripe.com', emailSource: 'domain' },
    { id: 'biz-29', email: 'admin@stripe.com', emailSource: 'domain' },

    { id: 'biz-30', email: 'contact@github.com', emailSource: 'serp' },
    { id: 'biz-31', email: 'info@github.com', emailSource: 'serp' },
    { id: 'biz-32', email: 'support@github.com', emailSource: 'serp' },
    { id: 'biz-33', email: 'hello@github.com', emailSource: 'serp' },
    { id: 'biz-34', email: 'admin@github.com', emailSource: 'serp' },

    // Mix of other domains (1-3 emails each)
    { id: 'biz-35', email: 'contact@google.com', emailSource: 'domain' },
    { id: 'biz-36', email: 'info@google.com', emailSource: 'domain' },

    { id: 'biz-37', email: 'hello@amazon.com', emailSource: 'domain' },
    { id: 'biz-38', email: 'support@amazon.com', emailSource: 'domain' },

    { id: 'biz-39', email: 'contact@microsoft.com', emailSource: 'serp' },

    { id: 'biz-40', email: 'info@apple.com', emailSource: 'serp' },

    // Invalid/edge cases
    { id: 'biz-41', email: 'invalid-email', emailSource: 'domain' }, // Invalid syntax
    { id: 'biz-42', email: 'test@tempmail.com', emailSource: 'serp' }, // Disposable
    { id: 'biz-43', email: 'fake@nonexistentdomain99999.com', emailSource: 'domain' }, // No MX records
  ];

  console.log(`Testing with ${testEmails.length} emails\n`);

  // Count unique domains
  const uniqueDomains = new Set(
    testEmails
      .filter((e) => e.email.includes('@'))
      .map((e) => e.email.split('@')[1])
  );
  console.log(`Unique domains: ${uniqueDomains.size}`);
  console.log(`Expected DNS queries WITHOUT optimization: ${testEmails.length}`);
  console.log(`Expected DNS queries WITH optimization: ~${uniqueDomains.size}\n`);
  console.log(`Optimization savings: ${testEmails.length - uniqueDomains.size} DNS queries (${((1 - uniqueDomains.size / testEmails.length) * 100).toFixed(1)}%)\n`);

  // Clear cache to start fresh
  scrapedEmailVerificationService.clearCache();

  console.log('Starting verification...\n');
  const startTime = Date.now();

  const results = await scrapedEmailVerificationService.verifyEmails(testEmails, {
    concurrency: 20,
    batchSize: testEmails.length,
    onProgress: (completed, total) => {
      if (completed % 10 === 0 || completed === total) {
        console.log(`  Progress: ${completed}/${total} emails verified`);
      }
    },
  });

  const duration = Date.now() - startTime;

  console.log('\n=== Results ===\n');
  console.log(`Total time: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
  console.log(`Average time per email: ${(duration / testEmails.length).toFixed(2)}ms`);

  // Show verification stats
  const stats = scrapedEmailVerificationService.getVerificationStats(results);
  console.log(`\nVerification Statistics:`);
  console.log(`  Total: ${stats.total}`);
  console.log(`  Valid: ${stats.valid} (${stats.verificationRate.toFixed(1)}%)`);
  console.log(`  Invalid: ${stats.invalid}`);
  console.log(`  Risky: ${stats.risky}`);
  console.log(`  Unknown: ${stats.unknown}`);

  // Show cache stats
  const cacheStats = scrapedEmailVerificationService.getCacheStats();
  console.log(`\nCache Statistics:`);
  console.log(`  Cache size: ${cacheStats.size} domains`);
  console.log(`  Cache hits: ${cacheStats.hits}`);

  // Show sample results by domain
  console.log(`\n=== Sample Results by Domain ===\n`);
  const resultsByDomain = new Map<string, EmailToVerify[]>();
  testEmails.forEach((email) => {
    const domain = email.email.split('@')[1] || 'invalid';
    if (!resultsByDomain.has(domain)) {
      resultsByDomain.set(domain, []);
    }
    resultsByDomain.get(domain)!.push(email);
  });

  // Show first 3 domains
  let count = 0;
  resultsByDomain.forEach((emails, domain) => {
    if (count >= 3) return;
    const firstEmail = emails[0];
    const result = results.get(firstEmail.id);
    console.log(`Domain: ${domain} (${emails.length} emails)`);
    console.log(`  Status: ${result?.status}`);
    console.log(`  MX Records: ${result?.details.mxRecords?.slice(0, 2).join(', ') || 'none'}`);
    console.log('');
    count++;
  });

  console.log('=== Test Complete ===');
}

// Run the test
testOptimizations()
  .then(() => {
    console.log('\n✅ Optimization test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

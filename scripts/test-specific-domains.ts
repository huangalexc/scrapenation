import { domainScraperService } from '../src/lib/services/domain-scraper-service';

/**
 * Test script to debug email extraction for specific domains
 * Run with: npx ts-node scripts/test-specific-domains.ts
 */
async function testSpecificDomains() {
  console.log('=== Testing Specific Domains ===\n');

  const testDomains = [
    { domain: 'carychiro.com', expectedEmail: 'info@carychiro.com', location: 'footer' },
    {
      domain: 'advancedpainandrehab.com',
      expectedEmail: 'Dr.doug@advancedpainandrehab.com',
      location: 'contact section with # anchor',
    },
  ];

  for (const test of testDomains) {
    console.log(`\nTesting: ${test.domain}`);
    console.log(`Expected: ${test.expectedEmail} (${test.location})`);
    console.log('---');

    const result = await domainScraperService.scrapeDomain(test.domain, {
      timeout: 10000,
      usePuppeteerFallback: true, // Enable fallback
    });

    console.log(`Result:`);
    console.log(`  Email: ${result.email || '(not found)'}`);
    console.log(`  Phone: ${result.phone || '(not found)'}`);
    console.log(`  Error: ${result.error || 'none'}`);

    if (result.email === test.expectedEmail) {
      console.log(`  ✅ SUCCESS - Found expected email`);
    } else {
      console.log(`  ❌ FAILED - Expected "${test.expectedEmail}", got "${result.email || 'nothing'}"`);
    }

    console.log('\n' + '='.repeat(60));
  }

  console.log('\n=== Test Complete ===');
}

// Run the test
testSpecificDomains()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

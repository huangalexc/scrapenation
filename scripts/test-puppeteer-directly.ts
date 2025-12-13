import { domainScraperService } from '../src/lib/services/domain-scraper-service';

const testDomains = [
  { domain: '100percentchiropractic.com', expected: 'info@100percentdoc.com' },
  { domain: 'buckinghamchiropractic.com', expected: 'drbuck@buckinghamchiropractic.com' },
  { domain: 'carolinafamilychiropractic.com', expected: 'frontdesk@carolinafamilychiropractic.com' },
  { domain: 'beyondwellnesscc.com', expected: 'admin@beyondwellnesscc.com' },
];

async function main() {
  console.log('=== Testing Hybrid Scraper (Cheerio + Puppeteer Fallback) ===\n');

  for (const { domain, expected } of testDomains) {
    console.log(`Testing: ${domain}`);
    console.log(`Expected email: ${expected}\n`);

    try {
      const result = await domainScraperService.scrapeDomain(domain, {
        timeout: 5000,
        usePuppeteerFallback: true,
      });

      console.log('Results:');
      console.log('─'.repeat(60));
      console.log(`✉️  Email: ${result.email || '❌ Not found'}`);
      console.log(`📞 Phone: ${result.phone || '❌ Not found'}`);
      console.log(`❗ Error: ${result.error || 'None'}`);

      if (result.email === expected) {
        console.log(`\n✅ SUCCESS! Found expected email: ${expected}`);
      } else if (result.email) {
        console.log(`\n⚠️  Found different email: ${result.email}`);
        console.log(`   Expected: ${expected}`);
      } else {
        console.log(`\n❌ No email found`);
      }

      console.log('\n' + '='.repeat(60) + '\n');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      console.log('\n' + '='.repeat(60) + '\n');
    }
  }

  console.log('✨ Test complete!\n');
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

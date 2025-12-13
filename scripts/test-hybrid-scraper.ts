import { domainScraperService } from '../src/lib/services/domain-scraper-service';

const testDomains = [
  { domain: '100percentchiropractic.com', expected: 'info@100percentdoc.com' },
  { domain: 'buckinghamchiropractic.com', expected: 'drbuck@buckinghamchiropractic.com' },
  { domain: 'carolinafamilychiropractic.com', expected: 'frontdesk@carolinafamilychiropractic.com' },
];

async function main() {
  console.log('Testing hybrid scraper (Cheerio + Puppeteer fallback)...\n');

  for (const { domain, expected } of testDomains) {
    console.log(`\n=== Testing ${domain} ===`);
    console.log(`Expected email: ${expected}`);

    try {
      const result = await domainScraperService.scrapeDomain(domain, {
        timeout: 3000,
        usePuppeteerFallback: true,
      });

      if (result.email) {
        const match = result.email.toLowerCase() === expected.toLowerCase();
        console.log(`✅ Found email: ${result.email} ${match ? '(CORRECT)' : '(DIFFERENT)'}`);
      } else {
        console.log(`❌ No email found`);
        console.log(`   Error: ${result.error}`);
      }

      if (result.phone) {
        console.log(`📞 Found phone: ${result.phone}`);
      }
    } catch (error: any) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  console.log('\n✨ Test complete!');
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

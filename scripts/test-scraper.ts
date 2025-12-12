import { domainScraperService } from '../src/lib/services/domain-scraper-service';

const testDomains = [
  { domain: '100percentchiropractic.com', expected: 'info@100percentdoc.com' },
  { domain: 'askdrernst.com', expected: 'info@cornerstonehealthctr.com' },
  { domain: 'beyondwellnesscc.com', expected: 'admin@beyondwellnesscc.com' },
  { domain: 'buckinghamchiropractic.com', expected: 'drbuck@buckinghamchiropractic.com' },
  { domain: 'carolinafamilychiropractic.com', expected: 'frontdesk@carolinafamilychiropractic.com' },
];

async function main() {
  console.log('Testing improved domain scraper...\n');

  for (const { domain, expected } of testDomains) {
    console.log(`Testing ${domain}...`);
    console.log(`Expected email: ${expected}`);

    try {
      const result = await domainScraperService.scrapeDomain(domain);

      if (result.email) {
        const match = result.email.toLowerCase() === expected.toLowerCase();
        console.log(`Found email: ${result.email} ${match ? '✅' : '❌'}`);
      } else {
        console.log(`Found email: None ❌`);
        console.log(`Error: ${result.error}`);
      }

      if (result.phone) {
        console.log(`Found phone: ${result.phone}`);
      }
    } catch (error) {
      console.log(`Error: ${error}`);
    }

    console.log('');
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

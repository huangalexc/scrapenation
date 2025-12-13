import { domainScraperService } from '../src/lib/services/domain-scraper-service';

async function testDomainScraping() {
  const testDomain = '100percentchiropractic.com';
  
  console.log(`\n=== Testing domain scraping for ${testDomain} ===\n`);
  
  try {
    const result = await domainScraperService.scrapeDomain(testDomain, {
      timeout: 5000,
      usePuppeteerFallback: true,
    });
    
    console.log('Scraping result:');
    console.log(`  Email: ${result.email || '(none found)'}`);
    console.log(`  Phone: ${result.phone || '(none found)'}`);
    console.log(`  Error: ${result.error || '(none)'}`);
  } catch (error) {
    console.error('Scraping failed:', error);
  }
}

testDomainScraping();

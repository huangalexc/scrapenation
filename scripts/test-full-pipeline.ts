import { serpEnrichmentService } from '../src/lib/services/serp-enrichment-service';
import { domainScraperService } from '../src/lib/services/domain-scraper-service';

async function testFullPipeline() {
  const business = {
    id: 'test-100percent',
    name: '100% Chiropractic',
    city: 'Colorado Springs',
    state: 'CO',
  };

  console.log('=== Testing Full Pipeline for 100% Chiropractic ===\n');
  console.log(`Business: ${business.name}`);
  console.log(`Location: ${business.city}, ${business.state}\n`);

  // Step 1: SERP Enrichment
  console.log('Step 1: SERP Enrichment (Google Custom Search + GPT)');
  console.log('─'.repeat(60));

  try {
    const enriched = await serpEnrichmentService.enrichBusinesses([business], {
      concurrency: 1,
      batchSize: 1,
    });

    if (enriched.length > 0) {
      const result = enriched[0];
      console.log('\n✅ SERP Enrichment Results:');
      console.log(`   Domain: ${result.enrichment.domain} (confidence: ${result.enrichment.domainConfidence}%)`);
      console.log(`   Email: ${result.enrichment.email || 'Not found'} (confidence: ${result.enrichment.emailConfidence || 'N/A'}%)`);
      console.log(`   Phone: ${result.enrichment.phone || 'Not found'} (confidence: ${result.enrichment.phoneConfidence || 'N/A'}%)`);

      // Step 2: Domain Scraping with Puppeteer Fallback
      if (result.enrichment.domain && result.enrichment.domainConfidence && result.enrichment.domainConfidence >= 70) {
        console.log('\n\nStep 2: Domain Scraping (Cheerio + Puppeteer fallback)');
        console.log('─'.repeat(60));
        console.log(`Scraping: ${result.enrichment.domain}\n`);

        const scrapingResult = await domainScraperService.scrapeDomain(result.enrichment.domain, {
          timeout: 3000,
          usePuppeteerFallback: true,
        });

        console.log('\n✅ Domain Scraping Results:');
        console.log(`   Email: ${scrapingResult.email || 'Not found'}`);
        console.log(`   Phone: ${scrapingResult.phone || 'Not found'}`);
        console.log(`   Error: ${scrapingResult.error || 'None'}`);

        // Final Combined Result
        console.log('\n\n📊 FINAL COMBINED RESULT');
        console.log('═'.repeat(60));
        const finalEmail = scrapingResult.email || result.enrichment.email;
        const finalPhone = scrapingResult.phone || result.enrichment.phone;

        console.log(`✉️  Email: ${finalEmail || '❌ Not found'}`);
        console.log(`📞 Phone: ${finalPhone || '❌ Not found'}`);
        console.log(`🌐 Domain: ${result.enrichment.domain}`);

        if (finalEmail === 'info@100percentdoc.com') {
          console.log('\n🎉 SUCCESS! Found the expected email!');
        } else if (finalEmail) {
          console.log(`\n⚠️  Found different email than expected (expected: info@100percentdoc.com)`);
        } else {
          console.log('\n❌ Failed to find email');
        }
      } else {
        console.log('\n⚠️  Domain confidence too low or no domain found - skipping scraping');
      }
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testFullPipeline()
  .catch(console.error)
  .finally(() => process.exit(0));

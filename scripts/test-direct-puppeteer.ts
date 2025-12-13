import { domainScraperService } from '../src/lib/services/domain-scraper-service';

async function testDirectPuppeteer() {
  const domain = '100percentchiropractic.com';
  const expectedEmail = 'info@100percentdoc.com';

  console.log('=== Testing Direct Puppeteer Scraping ===\n');
  console.log(`Domain: ${domain}`);
  console.log(`Expected email: ${expectedEmail}\n`);

  console.log('Testing with Puppeteer fallback enabled...\n');

  try {
    const result = await domainScraperService.scrapeDomain(domain, {
      timeout: 3000,
      usePuppeteerFallback: true,
    });

    console.log('Results:');
    console.log('─'.repeat(60));
    console.log(`Email: ${result.email || 'Not found'}`);
    console.log(`Phone: ${result.phone || 'Not found'}`);
    console.log(`Error: ${result.error || 'None'}`);

    if (result.email === expectedEmail) {
      console.log('\n🎉 SUCCESS! Found the expected email!');
    } else if (result.email) {
      console.log(`\n⚠️  Found different email: ${result.email}`);
      console.log(`   Expected: ${expectedEmail}`);
    } else {
      console.log('\n❌ No email found');
      console.log('\nNote: Puppeteer is disabled in development mode.');
      console.log('This will work in production on Railway.');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

testDirectPuppeteer()
  .catch(console.error)
  .finally(() => process.exit(0));

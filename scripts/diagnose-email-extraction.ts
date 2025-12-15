import axios from 'axios';
import * as cheerio from 'cheerio';
import { domainScraperService } from '../src/lib/services/domain-scraper-service';

/**
 * Diagnostic script to understand why emails aren't being found
 * Shows detailed step-by-step extraction process
 *
 * Run with: npx ts-node scripts/diagnose-email-extraction.ts
 */

async function diagnoseEmailExtraction(domain: string, expectedEmail: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`DIAGNOSING: ${domain}`);
  console.log(`EXPECTED EMAIL: ${expectedEmail}`);
  console.log('='.repeat(80));

  // Step 1: Fetch raw HTML
  console.log('\n[STEP 1] Fetching HTML with Cheerio (no JavaScript)...');
  let cheerioHtml = '';
  try {
    const response = await axios.get(`https://${domain}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });
    cheerioHtml = response.data;
    console.log(`✓ HTML fetched successfully (${cheerioHtml.length} characters)`);
  } catch (error: any) {
    console.log(`✗ Failed to fetch HTML: ${error.message}`);
    return;
  }

  // Step 2: Check for mailto links
  console.log('\n[STEP 2] Checking for mailto: links...');
  const $ = cheerio.load(cheerioHtml);
  $('script, style, noscript').remove();

  const mailtoLinks: string[] = [];
  $('a[href^="mailto:"]').each((_, elem) => {
    const href = $(elem).attr('href');
    if (href) {
      const email = href.replace('mailto:', '').split('?')[0];
      mailtoLinks.push(email);
      console.log(`  Found mailto: ${email}`);
    }
  });

  if (mailtoLinks.length === 0) {
    console.log('  ✗ No mailto: links found');
  } else {
    console.log(`  ✓ Found ${mailtoLinks.length} mailto: link(s)`);
  }

  // Step 3: Check visible text
  console.log('\n[STEP 3] Searching visible text for email pattern...');
  const text = $('body').text();
  const EMAIL_REGEX = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9._%+-])/gi;
  const textEmails = text.match(EMAIL_REGEX) || [];

  if (textEmails.length === 0) {
    console.log('  ✗ No emails found in visible text');
  } else {
    console.log(`  ✓ Found ${textEmails.length} email(s) in text:`);
    textEmails.slice(0, 10).forEach(email => console.log(`    - ${email}`));
    if (textEmails.length > 10) {
      console.log(`    ... and ${textEmails.length - 10} more`);
    }
  }

  // Step 4: Check all attributes
  console.log('\n[STEP 4] Searching all HTML attributes...');
  const attributeEmails: string[] = [];
  $('*').each((_, elem) => {
    if ('attribs' in elem && elem.attribs) {
      Object.values(elem.attribs).forEach((value) => {
        if (typeof value === 'string') {
          const matches = value.match(EMAIL_REGEX) || [];
          attributeEmails.push(...matches);
        }
      });
    }
  });

  if (attributeEmails.length === 0) {
    console.log('  ✗ No emails found in attributes');
  } else {
    const uniqueAttrEmails = [...new Set(attributeEmails)];
    console.log(`  ✓ Found ${uniqueAttrEmails.length} unique email(s) in attributes:`);
    uniqueAttrEmails.slice(0, 10).forEach(email => console.log(`    - ${email}`));
  }

  // Step 5: Check if expected email is in ANY of the sources
  console.log('\n[STEP 5] Checking for expected email...');
  const allFoundEmails = [...new Set([...mailtoLinks, ...textEmails, ...attributeEmails])];
  const expectedFound = allFoundEmails.some(email =>
    email.toLowerCase() === expectedEmail.toLowerCase()
  );

  if (expectedFound) {
    console.log(`  ✓ FOUND expected email: ${expectedEmail}`);
  } else {
    console.log(`  ✗ Expected email NOT FOUND in Cheerio HTML`);
    console.log(`  This suggests the email is loaded via JavaScript`);
  }

  // Step 6: Run actual scraper
  console.log('\n[STEP 6] Running actual scraper (Cheerio only)...');
  const cheerioResult = await domainScraperService.scrapeDomain(domain, {
    timeout: 10000,
    usePuppeteerFallback: false, // Disable Puppeteer first
  });

  console.log(`  Email: ${cheerioResult.email || '(none)'}`);
  console.log(`  Phone: ${cheerioResult.phone || '(none)'}`);
  console.log(`  Error: ${cheerioResult.error || 'none'}`);

  if (cheerioResult.email === expectedEmail.toLowerCase()) {
    console.log(`  ✓ Cheerio scraper found the expected email!`);
  } else if (cheerioResult.email) {
    console.log(`  ⚠ Cheerio found a different email`);
  } else {
    console.log(`  ✗ Cheerio scraper did not find the email`);
  }

  // Step 7: Try with Puppeteer fallback
  console.log('\n[STEP 7] Running scraper WITH Puppeteer fallback...');
  console.log('  (This may take 10-20 seconds...)');

  const puppeteerResult = await domainScraperService.scrapeDomain(domain, {
    timeout: 10000,
    usePuppeteerFallback: true, // Enable Puppeteer
  });

  console.log(`  Email: ${puppeteerResult.email || '(none)'}`);
  console.log(`  Phone: ${puppeteerResult.phone || '(none)'}`);
  console.log(`  Error: ${puppeteerResult.error || 'none'}`);

  if (puppeteerResult.email === expectedEmail.toLowerCase()) {
    console.log(`  ✓ SUCCESS! Puppeteer found the expected email!`);
  } else if (puppeteerResult.email) {
    console.log(`  ⚠ Puppeteer found a different email`);
  } else {
    console.log(`  ✗ Puppeteer also did not find the email`);
  }

  // Summary
  console.log('\n[SUMMARY]');
  console.log('─'.repeat(80));
  console.log(`Domain: ${domain}`);
  console.log(`Expected: ${expectedEmail}`);
  console.log(`Cheerio result: ${cheerioResult.email || 'NOT FOUND'}`);
  console.log(`Puppeteer result: ${puppeteerResult.email || 'NOT FOUND'}`);

  if (puppeteerResult.email === expectedEmail.toLowerCase()) {
    console.log(`Status: ✅ EMAIL FOUND (case normalized to lowercase)`);
  } else if (cheerioResult.email === expectedEmail.toLowerCase()) {
    console.log(`Status: ✅ EMAIL FOUND WITH CHEERIO`);
  } else if (allFoundEmails.length > 0) {
    console.log(`Status: ⚠️  EMAIL EXTRACTION ISSUE - email exists in HTML but wasn't selected`);
    console.log(`All emails found: ${allFoundEmails.join(', ')}`);
  } else {
    console.log(`Status: ⚠️  EMAIL NOT IN HTML - likely JavaScript-rendered or obfuscated`);
  }
  console.log('─'.repeat(80));
}

async function main() {
  console.log('='.repeat(80));
  console.log('EMAIL EXTRACTION DIAGNOSTIC TOOL');
  console.log('='.repeat(80));

  const testCases = [
    { domain: 'carychiro.com', expectedEmail: 'info@carychiro.com' },
    { domain: 'advancedpainandrehab.com', expectedEmail: 'Dr.doug@advancedpainandrehab.com' },
  ];

  for (const testCase of testCases) {
    await diagnoseEmailExtraction(testCase.domain, testCase.expectedEmail);

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('='.repeat(80));
}

main()
  .then(() => {
    console.log('\n✅ Diagnostic completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnostic failed:', error);
    process.exit(1);
  });

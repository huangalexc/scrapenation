import axios from 'axios';
import * as cheerio from 'cheerio';

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g;

async function testDomain(domain: string, path: string = '') {
  const url = `https://${domain}${path}`;
  console.log(`\nFetching: ${url}`);

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const $ = cheerio.load(response.data);

    // Remove scripts and styles
    $('script, style, noscript').remove();

    // Check mailto links
    const mailtoLinks: string[] = [];
    $('a[href^="mailto:"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        mailtoLinks.push(href.replace('mailto:', '').split('?')[0]);
      }
    });

    if (mailtoLinks.length > 0) {
      console.log('Mailto links:', mailtoLinks);
    }

    // Check body text
    const text = $('body').text();
    const textEmails = text.match(EMAIL_REGEX) || [];
    const uniqueTextEmails = [...new Set(textEmails)];

    if (uniqueTextEmails.length > 0) {
      console.log('Emails in text:', uniqueTextEmails);
    }

    if (mailtoLinks.length === 0 && uniqueTextEmails.length === 0) {
      console.log('No emails found');
    }
  } catch (error: any) {
    console.log(`Error: ${error.message}`);
  }
}

async function main() {
  console.log('=== Testing 100percentchiropractic.com ===');
  await testDomain('100percentchiropractic.com');
  await testDomain('100percentchiropractic.com', '/contact');

  console.log('\n=== Testing buckinghamchiropractic.com ===');
  await testDomain('buckinghamchiropractic.com');
  await testDomain('buckinghamchiropractic.com', '/contact');

  console.log('\n=== Testing carolinafamilychiropractic.com ===');
  await testDomain('carolinafamilychiropractic.com');
  await testDomain('carolinafamilychiropractic.com', '/contact-us');
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

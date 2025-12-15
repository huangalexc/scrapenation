import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { domainScraperService } from '@/lib/services/domain-scraper-service';

/**
 * API endpoint for diagnosing email extraction issues
 * GET /api/debug/scrape-test?domain=example.com&expectedEmail=test@example.com
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get('domain');
  const expectedEmail = searchParams.get('expectedEmail');

  if (!domain) {
    return NextResponse.json(
      { error: 'Missing required parameter: domain' },
      { status: 400 }
    );
  }

  const diagnostic = {
    domain,
    expectedEmail,
    timestamp: new Date().toISOString(),
    steps: [] as any[],
    summary: {} as any,
  };

  try {
    // Step 1: Fetch raw HTML
    diagnostic.steps.push({
      step: 1,
      name: 'Fetch HTML with Cheerio (no JavaScript)',
      status: 'running',
    });

    let cheerioHtml = '';
    try {
      const response = await axios.get(`https://${domain}`, {
        timeout: 10000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });
      cheerioHtml = response.data;
      diagnostic.steps[0].status = 'success';
      diagnostic.steps[0].htmlSize = cheerioHtml.length;
    } catch (error: any) {
      diagnostic.steps[0].status = 'failed';
      diagnostic.steps[0].error = error.message;
      return NextResponse.json(diagnostic);
    }

    // Step 2: Check for mailto links
    diagnostic.steps.push({
      step: 2,
      name: 'Check for mailto: links',
      status: 'running',
    });

    const $ = cheerio.load(cheerioHtml);
    $('script, style, noscript').remove();

    const mailtoLinks: string[] = [];
    $('a[href^="mailto:"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        const email = href.replace('mailto:', '').split('?')[0];
        mailtoLinks.push(email);
      }
    });

    diagnostic.steps[1].status = 'success';
    diagnostic.steps[1].mailtoLinks = mailtoLinks;
    diagnostic.steps[1].count = mailtoLinks.length;

    // Step 3: Check visible text
    diagnostic.steps.push({
      step: 3,
      name: 'Search visible text for email pattern',
      status: 'running',
    });

    const text = $('body').text();
    const EMAIL_REGEX =
      /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9._%+-])/gi;
    const textEmails = text.match(EMAIL_REGEX) || [];

    diagnostic.steps[2].status = 'success';
    diagnostic.steps[2].textEmails = textEmails.slice(0, 10);
    diagnostic.steps[2].count = textEmails.length;

    // Step 4: Check all attributes
    diagnostic.steps.push({
      step: 4,
      name: 'Search all HTML attributes',
      status: 'running',
    });

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

    const uniqueAttrEmails = [...new Set(attributeEmails)];
    diagnostic.steps[3].status = 'success';
    diagnostic.steps[3].attributeEmails = uniqueAttrEmails.slice(0, 10);
    diagnostic.steps[3].count = uniqueAttrEmails.length;

    // Step 5: Check if expected email is found
    diagnostic.steps.push({
      step: 5,
      name: 'Check for expected email',
      status: 'running',
    });

    const allFoundEmails = [...new Set([...mailtoLinks, ...textEmails, ...attributeEmails])];
    const expectedFound = expectedEmail
      ? allFoundEmails.some((email) => email.toLowerCase() === expectedEmail.toLowerCase())
      : false;

    diagnostic.steps[4].status = 'success';
    diagnostic.steps[4].expectedFound = expectedFound;
    diagnostic.steps[4].allFoundEmails = allFoundEmails.slice(0, 20);

    // Step 6: Run actual scraper (Cheerio only)
    diagnostic.steps.push({
      step: 6,
      name: 'Run actual scraper (Cheerio only)',
      status: 'running',
    });

    const cheerioResult = await domainScraperService.scrapeDomain(domain, {
      timeout: 10000,
      usePuppeteerFallback: false,
    });

    diagnostic.steps[5].status = 'success';
    diagnostic.steps[5].result = cheerioResult;

    // Step 7: Run with Puppeteer fallback
    diagnostic.steps.push({
      step: 7,
      name: 'Run scraper WITH Puppeteer fallback',
      status: 'running',
    });

    const puppeteerResult = await domainScraperService.scrapeDomain(domain, {
      timeout: 10000,
      usePuppeteerFallback: true,
    });

    diagnostic.steps[6].status = 'success';
    diagnostic.steps[6].result = puppeteerResult;

    // Summary
    diagnostic.summary = {
      domain,
      expectedEmail,
      cheerioResult: cheerioResult.email || 'NOT FOUND',
      puppeteerResult: puppeteerResult.email || 'NOT FOUND',
      cheerioPhone: cheerioResult.phone || 'NOT FOUND',
      puppeteerPhone: puppeteerResult.phone || 'NOT FOUND',
      diagnosis: '',
    };

    if (expectedEmail) {
      if (puppeteerResult.email?.toLowerCase() === expectedEmail.toLowerCase()) {
        diagnostic.summary.diagnosis = 'SUCCESS - Puppeteer found expected email';
      } else if (cheerioResult.email?.toLowerCase() === expectedEmail.toLowerCase()) {
        diagnostic.summary.diagnosis = 'SUCCESS - Cheerio found expected email';
      } else if (allFoundEmails.length > 0) {
        diagnostic.summary.diagnosis =
          'ISSUE - Email exists in HTML but was not selected by scraper';
      } else {
        diagnostic.summary.diagnosis =
          'ISSUE - Email not in HTML, likely JavaScript-rendered or obfuscated';
      }
    } else {
      diagnostic.summary.diagnosis = 'No expected email provided for comparison';
    }

    return NextResponse.json(diagnostic, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Diagnostic failed',
        message: error.message,
        diagnostic,
      },
      { status: 500 }
    );
  }
}

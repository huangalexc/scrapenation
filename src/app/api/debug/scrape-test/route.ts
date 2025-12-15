import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { domainScraperService } from '@/lib/services/domain-scraper-service';

// Increase max duration for this API route (Railway/Vercel allow up to 300s for Pro)
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

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
    // Clear Puppeteer's failed domains cache for fresh diagnostic
    const { puppeteerScraperService } = await import('@/lib/services/puppeteer-scraper-service');
    puppeteerScraperService.clearFailedDomains();

    // Step 1: Fetch raw HTML
    diagnostic.steps.push({
      step: 1,
      name: 'Fetch HTML with Cheerio (no JavaScript)',
      status: 'running',
    });

    let cheerioHtml = '';
    let cheerioFailed = false;
    try {
      const response = await axios.get(`https://${domain}`, {
        timeout: 30000, // Increased to 30 seconds
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        maxRedirects: 5,
      });
      cheerioHtml = response.data;
      diagnostic.steps[0].status = 'success';
      diagnostic.steps[0].htmlSize = cheerioHtml.length;
    } catch (error: any) {
      diagnostic.steps[0].status = 'failed';
      diagnostic.steps[0].error = error.message;
      cheerioFailed = true;
      console.log(`[DEBUG] Cheerio failed for ${domain}, continuing to Puppeteer...`);
      // Don't return yet - continue to test Puppeteer
    }

    let mailtoLinks: string[] = [];
    let textEmails: string[] = [];
    let attributeEmails: string[] = [];
    let allFoundEmails: string[] = [];
    let cheerioResult: any = null;

    // Only run Cheerio analysis if we successfully fetched HTML
    if (!cheerioFailed) {
      // Step 2: Check for mailto links
      diagnostic.steps.push({
        step: 2,
        name: 'Check for mailto: links',
        status: 'running',
      });

      const $ = cheerio.load(cheerioHtml);
      $('script, style, noscript').remove();

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
      textEmails = text.match(EMAIL_REGEX) || [];

      diagnostic.steps[2].status = 'success';
      diagnostic.steps[2].textEmails = textEmails.slice(0, 10);
      diagnostic.steps[2].count = textEmails.length;

      // Step 4: Check all attributes
      diagnostic.steps.push({
        step: 4,
        name: 'Search all HTML attributes',
        status: 'running',
      });

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

      allFoundEmails = [...new Set([...mailtoLinks, ...textEmails, ...attributeEmails])];
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

      cheerioResult = await domainScraperService.scrapeDomain(domain, {
        timeout: 30000, // Increased to 30 seconds
        usePuppeteerFallback: false,
      });

      diagnostic.steps[5].status = 'success';
      diagnostic.steps[5].result = cheerioResult;
    } else {
      // Cheerio failed - skip to Puppeteer
      console.log(`[DEBUG] Skipping Cheerio analysis for ${domain}`);
      diagnostic.steps.push({
        step: 2,
        name: 'Skipped Cheerio analysis (HTML fetch failed)',
        status: 'skipped',
      });
    }

    // Step 7: Run with Puppeteer fallback
    console.log(`[DEBUG] About to test Puppeteer for ${domain}`);
    diagnostic.steps.push({
      step: cheerioFailed ? 3 : 7,
      name: 'Run scraper WITH Puppeteer fallback (may take 30-60 seconds)',
      status: 'running',
    });

    let puppeteerResult: any = { email: null, phone: null, error: 'NOT_ATTEMPTED' };
    try {
      puppeteerResult = await domainScraperService.scrapeDomain(domain, {
        timeout: 60000, // Increased to 60 seconds for slow sites
        usePuppeteerFallback: true,
      });

      const stepIndex = diagnostic.steps.length - 1;
      diagnostic.steps[stepIndex].status = 'success';
      diagnostic.steps[stepIndex].result = puppeteerResult;
    } catch (puppeteerError: any) {
      const stepIndex = diagnostic.steps.length - 1;
      diagnostic.steps[stepIndex].status = 'failed';
      diagnostic.steps[stepIndex].error = puppeteerError.message;
      puppeteerResult = { email: null, phone: null, error: puppeteerError.message };
    }

    // Summary
    diagnostic.summary = {
      domain,
      expectedEmail,
      cheerioFailed,
      cheerioResult: cheerioResult?.email || 'NOT FOUND',
      puppeteerResult: puppeteerResult.email || 'NOT FOUND',
      cheerioPhone: cheerioResult?.phone || 'NOT FOUND',
      puppeteerPhone: puppeteerResult.phone || 'NOT FOUND',
      diagnosis: '',
    };

    if (expectedEmail) {
      if (puppeteerResult.email?.toLowerCase() === expectedEmail.toLowerCase()) {
        diagnostic.summary.diagnosis = 'SUCCESS - Puppeteer found expected email';
      } else if (!cheerioFailed && cheerioResult?.email?.toLowerCase() === expectedEmail.toLowerCase()) {
        diagnostic.summary.diagnosis = 'SUCCESS - Cheerio found expected email';
      } else if (cheerioFailed && puppeteerResult.email) {
        diagnostic.summary.diagnosis = 'PARTIAL SUCCESS - Cheerio failed (timeout/connection), but Puppeteer found an email';
      } else if (cheerioFailed) {
        diagnostic.summary.diagnosis = 'ISSUE - Cheerio failed (timeout/connection) and Puppeteer also could not find email';
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

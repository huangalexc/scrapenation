import { prisma } from '../src/lib/prisma';

async function checkJobStatus() {
  const jobId = 'cmj4j217c0001jr04yxx0f4ey';

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      user: {
        select: { email: true }
      }
    }
  });

  if (!job) {
    console.log('Job not found');
    return;
  }

  console.log('\n=== Job Status ===');
  console.log(`ID: ${job.id}`);
  console.log(`Status: ${job.status}`);
  console.log(`Current Step: ${job.currentStep}`);
  console.log(`User: ${job.user.email}`);
  console.log(`Business Type: ${job.businessType}`);
  console.log(`Created: ${job.createdAt}`);
  console.log(`Updated: ${job.updatedAt}`);
  console.log(`Last Progress: ${job.lastProgressAt}`);
  
  console.log('\n=== Progress ===');
  console.log(`Total ZIPs: ${job.totalZips}`);
  console.log(`ZIPs Processed: ${job.zipsProcessed}`);
  console.log(`Businesses Found: ${job.businessesFound}`);
  console.log(`Businesses Enriched: ${job.businessesEnriched}`);
  console.log(`Businesses Scraped: ${job.businessesScraped}`);
  
  console.log('\n=== API Usage ===');
  console.log(`Places API Calls: ${job.placesApiCalls}`);
  console.log(`SERP API Calls: ${job.customSearchCalls}`);
  console.log(`OpenAI Calls: ${job.openaiCalls}`);
  console.log(`Estimated Cost: $${job.estimatedCost.toFixed(2)}`);
  
  console.log('\n=== Errors ===');
  console.log(`Errors Encountered: ${job.errorsEncountered}`);
  if (job.errorLog) {
    console.log(`Error Log: ${job.errorLog}`);
  }

  // Check actual business count in database
  const businessCount = await prisma.jobBusiness.count({
    where: { jobId }
  });

  const businessesWithDomains = await prisma.business.count({
    where: {
      jobBusinesses: { some: { jobId } },
      serpDomain: { not: null }
    }
  });

  const businessesWithScrapedEmails = await prisma.business.count({
    where: {
      jobBusinesses: { some: { jobId } },
      domainEmail: { not: null }
    }
  });

  const businessesWithScrapeErrors = await prisma.business.count({
    where: {
      jobBusinesses: { some: { jobId } },
      scrapeError: { not: null }
    }
  });

  console.log('\n=== Database Verification ===');
  console.log(`Total businesses in DB for this job: ${businessCount}`);
  console.log(`Businesses with domains: ${businessesWithDomains}`);
  console.log(`Businesses with scraped emails: ${businessesWithScrapedEmails}`);
  console.log(`Businesses with scrape errors: ${businessesWithScrapeErrors}`);
  
  // Time since last progress
  const timeSinceProgress = Date.now() - new Date(job.lastProgressAt).getTime();
  const minutesSinceProgress = Math.floor(timeSinceProgress / 60000);
  console.log(`\n=== Stall Detection ===`);
  console.log(`Minutes since last progress: ${minutesSinceProgress}`);
  console.log(`Stalled? ${minutesSinceProgress > 2 ? 'YES' : 'NO'}`);
}

checkJobStatus()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

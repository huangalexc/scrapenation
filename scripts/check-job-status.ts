import { prisma } from '../src/lib/prisma';

async function checkJobStatus() {
  const jobId = 'cmj4c3c2n0001kw04d0fhjhs6';

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

  console.log('Job Status:');
  console.log('─'.repeat(60));
  console.log(`Job ID: ${job.id}`);
  console.log(`User: ${job.user.email}`);
  console.log(`Status: ${job.status}`);
  console.log(`Business Type: ${job.businessType}`);
  console.log(`Geography: ${job.geography.join(', ')}`);
  console.log(`Created: ${job.createdAt}`);
  console.log(`Updated: ${job.updatedAt}`);
  console.log('');
  console.log('Progress:');
  console.log(`  Total ZIPs: ${job.totalZips}`);
  console.log(`  ZIPs Processed: ${job.zipsProcessed}`);
  console.log(`  Businesses Found: ${job.businessesFound}`);
  console.log(`  Businesses Enriched: ${job.businessesEnriched}`);
  console.log(`  Businesses Scraped: ${job.businessesScraped}`);
  console.log('');
  console.log('API Usage:');
  console.log(`  Places API Calls: ${job.placesApiCalls}`);
  console.log(`  Custom Search Calls: ${job.customSearchCalls}`);
  console.log(`  OpenAI Calls: ${job.openaiCalls}`);
  console.log(`  Estimated Cost: $${job.estimatedCost.toFixed(2)}`);

  if (job.errorLog) {
    console.log('');
    console.log('Error Log:');
    console.log(job.errorLog);
  }
}

checkJobStatus()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

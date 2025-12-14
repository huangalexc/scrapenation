import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobId = process.argv[2];

  if (!jobId) {
    console.log('Usage: npx tsx scripts/resume-job.ts <jobId>');
    process.exit(1);
  }

  console.log(`Checking job ${jobId}...`);

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      currentStep: true,
      totalZips: true,
      zipsProcessed: true,
      businessesFound: true,
      businessesEnriched: true,
      businessesScraped: true,
      placesApiCalls: true,
      customSearchCalls: true,
      openaiCalls: true,
      estimatedCost: true,
      errorLog: true,
      createdAt: true,
      updatedAt: true,
      lastProgressAt: true,
    },
  });

  if (!job) {
    console.log('❌ Job not found');
    process.exit(1);
  }

  console.log('\n📊 Job Status:');
  console.log(`  Status: ${job.status}`);
  console.log(`  Current Step: ${job.currentStep}`);
  console.log(`  Created: ${job.createdAt.toISOString()}`);
  console.log(`  Last Progress: ${job.lastProgressAt?.toISOString() || 'Never'}`);

  console.log('\n📈 Progress:');
  console.log(`  ZIPs: ${job.zipsProcessed}/${job.totalZips}`);
  console.log(`  Businesses Found: ${job.businessesFound}`);
  console.log(`  Businesses Enriched: ${job.businessesEnriched}`);
  console.log(`  Businesses Scraped: ${job.businessesScraped}`);

  console.log('\n💰 API Usage:');
  console.log(`  Places API Calls: ${job.placesApiCalls}`);
  console.log(`  SERP API Calls: ${job.customSearchCalls}`);
  console.log(`  OpenAI API Calls: ${job.openaiCalls}`);
  console.log(`  Estimated Cost: $${job.estimatedCost.toFixed(2)}`);

  if (job.errorLog) {
    console.log('\n❌ Error Log:');
    console.log(job.errorLog);
  }

  // Count actual database state
  console.log('\n🔍 Database State:');
  const enrichedCount = await prisma.business.count({
    where: {
      jobBusinesses: { some: { jobId } },
      serpDomain: { not: null },
    },
  });
  console.log(`  Actually enriched in DB: ${enrichedCount}`);

  const scrapedCount = await prisma.business.count({
    where: {
      jobBusinesses: { some: { jobId } },
      OR: [
        { domainEmail: { not: null } },
        { domainPhone: { not: null } },
        { scrapeError: { not: null } },
      ],
    },
  });
  console.log(`  Actually scraped in DB: ${scrapedCount}`);

  const unscrapedCount = await prisma.business.count({
    where: {
      jobBusinesses: { some: { jobId } },
      serpDomainConfidence: { gte: 70 },
      domainEmail: null,
      domainPhone: null,
      scrapeError: null,
    },
  });
  console.log(`  Still need scraping: ${unscrapedCount}`);

  // Determine if we should resume
  if (job.status === 'FAILED') {
    console.log('\n✅ Job can be resumed!');
    console.log(`   Will continue from step: ${job.currentStep}`);
    console.log(`   ${unscrapedCount} domains still need scraping`);

    const resume = process.argv[3] === '--resume';
    if (resume) {
      console.log('\n🔄 Resuming job...');
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          errorLog: null,
        },
      });
      console.log('✅ Job reset to PENDING - worker will pick it up');
    } else {
      console.log('\n💡 To resume this job, run:');
      console.log(`   npx tsx scripts/resume-job.ts ${jobId} --resume`);
    }
  } else if (job.status === 'COMPLETED') {
    console.log('\n✅ Job already completed!');
  } else if (job.status === 'RUNNING') {
    console.log('\n⏳ Job is currently running');
  } else if (job.status === 'PENDING') {
    console.log('\n⏳ Job is pending (worker will pick it up)');
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

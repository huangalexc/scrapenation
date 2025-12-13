import { prisma } from '../src/lib/prisma';

async function failStalledJob() {
  const jobId = 'cmj4c3c2n0001kw04d0fhjhs6';

  console.log(`Marking job ${jobId} as FAILED...`);

  // Mark the job as FAILED since it can't resume from partial progress
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      errorLog: 'Job stalled during domain scraping (92/128 completed). Worker likely crashed during Puppeteer scraping. Puppeteer now tested and working - please create a new job.',
    },
  });

  console.log('✅ Job marked as FAILED');
  console.log('You can now create a new job which will run successfully with the fixed worker.');
}

failStalledJob()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

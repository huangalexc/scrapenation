import { prisma } from '../src/lib/prisma';

async function failStalledJob() {
  const jobId = 'cmj4b6lyf0001jt04n51xiwmp';

  console.log(`Marking job ${jobId} as FAILED...`);

  // Mark the job as FAILED since it can't resume from partial progress
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      errorLog: 'Job stalled during SERP enrichment (13/129 completed). Worker crashed due to DATABASE_URL missing during build. Fixed in latest deployment - please create a new job.',
    },
  });

  console.log('✅ Job marked as FAILED');
  console.log('You can now create a new job which will run successfully with the fixed worker.');
}

failStalledJob()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

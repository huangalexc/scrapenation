import { prisma } from '../src/lib/prisma';

async function cancelAllJobs() {
  console.log('Cancelling all jobs...');

  const result = await prisma.job.updateMany({
    where: {
      status: {
        in: ['PENDING', 'RUNNING'],
      },
    },
    data: {
      status: 'CANCELLED',
    },
  });

  console.log(`✅ Cancelled ${result.count} job(s)`);
}

cancelAllJobs()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

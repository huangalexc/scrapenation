import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    where: { status: { in: ['PENDING', 'RUNNING'] } },
    select: {
      id: true,
      status: true,
      createdAt: true,
      businessType: true,
      geography: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${jobs.length} pending/running jobs:\n`);
  jobs.forEach((job, i) => {
    console.log(`${i + 1}. ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Type: ${job.businessType}`);
    console.log(`   Geography: ${job.geography.join(', ')}`);
    console.log(`   Created: ${job.createdAt.toISOString()}\n`);
  });
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

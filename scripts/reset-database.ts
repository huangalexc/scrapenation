import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database reset...');

  // Delete all junction table records first (due to foreign keys)
  console.log('Deleting UserBusiness records...');
  const deletedUserBusinesses = await prisma.userBusiness.deleteMany({});
  console.log(`Deleted ${deletedUserBusinesses.count} UserBusiness records`);

  console.log('Deleting JobBusiness records...');
  const deletedJobBusinesses = await prisma.jobBusiness.deleteMany({});
  console.log(`Deleted ${deletedJobBusinesses.count} JobBusiness records`);

  // Delete all businesses
  console.log('Deleting all businesses...');
  const deletedBusinesses = await prisma.business.deleteMany({});
  console.log(`Deleted ${deletedBusinesses.count} businesses`);

  // Delete all jobs
  console.log('Deleting all jobs...');
  const deletedJobs = await prisma.job.deleteMany({});
  console.log(`Deleted ${deletedJobs.count} jobs`);

  // Reset test user's job counter
  const testUser = await prisma.user.findUnique({
    where: { email: 'test@example.com' },
  });

  if (testUser) {
    console.log('Resetting test user job counter...');
    await prisma.user.update({
      where: { id: testUser.id },
      data: { jobsCreated: 0 },
    });
    console.log('Test user reset complete');
  } else {
    console.log('No test user found');
  }

  console.log('Database reset complete!');
}

main()
  .catch((e) => {
    console.error('Error during reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

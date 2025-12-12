import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const testUser = await prisma.user.findUnique({
    where: { email: 'test@example.com' },
  });

  if (!testUser) {
    console.log('Test user not found');
    return;
  }

  console.log('Current test user status:');
  console.log(`- Email: ${testUser.email}`);
  console.log(`- Jobs Created: ${testUser.jobsCreated}`);
  console.log(`- Tier: ${testUser.tier}`);

  // Reset job count
  const updated = await prisma.user.update({
    where: { email: 'test@example.com' },
    data: { jobsCreated: 0 },
  });

  console.log('\nAfter reset:');
  console.log(`- Jobs Created: ${updated.jobsCreated}`);

  // Also delete any existing jobs for this user
  const deletedJobs = await prisma.job.deleteMany({
    where: { userId: testUser.id },
  });

  console.log(`\nDeleted ${deletedJobs.count} existing jobs for test user`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

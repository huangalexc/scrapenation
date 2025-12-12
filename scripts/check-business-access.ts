import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobId = 'cmj3c7tix0003l4042joi9fe4';

  console.log('Checking job and business access...\n');

  // Get job details
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      user: {
        select: { id: true, email: true }
      }
    }
  });

  if (!job) {
    console.log('Job not found!');
    return;
  }

  console.log('Job Details:');
  console.log('- Job ID:', job.id);
  console.log('- User:', job.user.email, '(', job.user.id, ')');
  console.log('- Status:', job.status);
  console.log('- Businesses Found:', job.businessesFound);
  console.log('');

  // Count JobBusiness records
  const jobBusinessCount = await prisma.jobBusiness.count({
    where: { jobId }
  });

  console.log('JobBusiness Records:', jobBusinessCount);

  // Count UserBusiness records for this user
  const userBusinessCount = await prisma.userBusiness.count({
    where: {
      userId: job.userId,
      jobId: jobId
    }
  });

  console.log('UserBusiness Records (for this job):', userBusinessCount);

  // Count total UserBusiness records for this user
  const totalUserBusinessCount = await prisma.userBusiness.count({
    where: {
      userId: job.userId
    }
  });

  console.log('UserBusiness Records (total for user):', totalUserBusinessCount);

  // Count total businesses
  const totalBusinesses = await prisma.business.count();
  console.log('Total Businesses in DB:', totalBusinesses);

  // Check if businesses exist but UserBusiness records are missing
  const jobBusinessRecords = await prisma.jobBusiness.findMany({
    where: { jobId },
    select: { businessId: true }
  });

  const businessIds = jobBusinessRecords.map(jb => jb.businessId);

  // Check how many of these businesses have UserBusiness records
  const userBusinessRecords = await prisma.userBusiness.findMany({
    where: {
      userId: job.userId,
      businessId: { in: businessIds }
    },
    select: { businessId: true }
  });

  const missingCount = businessIds.length - userBusinessRecords.length;

  console.log('\nMissing UserBusiness Records:', missingCount);

  if (missingCount > 0) {
    console.log('\n⚠️  Problem: JobBusiness records exist but UserBusiness records are missing!');
    console.log('This means businesses were found but user access was not granted.');
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

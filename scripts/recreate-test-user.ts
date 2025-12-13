import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function recreateTestUser() {
  const email = 'test@example.com';
  const password = 'TestPass123';

  console.log('Checking for existing test user...');

  // Delete existing user if exists
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log(`Found existing user: ${existing.id}`);
    console.log('Deleting existing user and related data...');

    // Cascade delete will handle jobs, userBusinesses
    await prisma.user.delete({ where: { email } });
    console.log('✅ Deleted existing user');
  }

  // Create new user
  console.log('\nCreating new test user...');
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      emailVerified: new Date(), // Pre-verify for testing
      tier: 'FREE',
      jobsCreated: 0,
    },
  });

  console.log('✅ Created test user:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Tier: ${user.tier}`);
  console.log(`   Email Verified: ${user.emailVerified}`);
  console.log('\nYou can now log in with:');
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
}

recreateTestUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

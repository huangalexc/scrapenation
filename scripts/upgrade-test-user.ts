import { PrismaClient, UserTier } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Upgrading test user to Pro...');

  const testUser = await prisma.user.findUnique({
    where: { email: 'test@example.com' },
  });

  if (!testUser) {
    console.log('❌ Test user not found');
    process.exit(1);
  }

  console.log(`Current tier: ${testUser.tier}`);

  if (testUser.tier === UserTier.PRO) {
    console.log('✅ Test user is already on Pro tier');
    return;
  }

  await prisma.user.update({
    where: { id: testUser.id },
    data: { tier: UserTier.PRO },
  });

  console.log('✅ Test user upgraded to Pro tier');
}

main()
  .catch((e) => {
    console.error('Error during upgrade:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

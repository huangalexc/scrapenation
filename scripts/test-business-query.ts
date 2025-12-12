import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = 'cmj2uk8n80000bojhzhqutuhq'; // test@example.com

  console.log('Testing business query for user:', userId, '\n');

  // Simulate the exact query from getBusinesses
  const where: any = {
    userBusinesses: {
      some: {
        userId: userId,
      },
    },
  };

  const total = await prisma.business.count({ where });
  console.log('Total businesses accessible to user:', total);

  // Get first few businesses
  const businesses = await prisma.business.findMany({
    where,
    take: 5,
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
    }
  });

  console.log('\nFirst 5 businesses:');
  businesses.forEach((b, i) => {
    console.log(`${i + 1}. ${b.name} - ${b.city}, ${b.state}`);
  });

  // Check UserBusiness records directly
  const userBusinesses = await prisma.userBusiness.findMany({
    where: { userId },
    take: 5,
    include: {
      business: {
        select: {
          name: true,
          city: true,
          state: true
        }
      }
    }
  });

  console.log('\nFirst 5 UserBusiness records:');
  userBusinesses.forEach((ub, i) => {
    console.log(`${i + 1}. ${ub.business.name} - ${ub.business.city}, ${ub.business.state}`);
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

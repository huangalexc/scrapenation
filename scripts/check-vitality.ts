import { prisma } from '../src/lib/prisma';

async function main() {
  const vitality = await prisma.business.findFirst({
    where: {
      name: {
        contains: 'Vitality',
        mode: 'insensitive'
      }
    },
    select: {
      name: true,
      city: true,
      state: true,
      serpDomain: true,
      formattedAddress: true,
    }
  });

  console.log('Vitality Chiropractic business:');
  console.log(JSON.stringify(vitality, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });

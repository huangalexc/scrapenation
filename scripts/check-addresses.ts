import { prisma } from '../src/lib/prisma';

async function main() {
  // Get recent businesses with their addresses
  const businesses = await prisma.business.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      name: true,
      formattedAddress: true,
      city: true,
      state: true,
      serpDomain: true,
      serpEmail: true,
      domainEmail: true,
    },
  });

  console.log('Recent businesses with address parsing:');
  console.log('=====================================\n');

  businesses.forEach((b, i) => {
    console.log(`${i + 1}. ${b.name}`);
    console.log(`   Formatted Address: ${b.formattedAddress || 'N/A'}`);
    console.log(`   Parsed City: ${b.city || 'NULL'}`);
    console.log(`   Parsed State: ${b.state || 'NULL'}`);
    console.log(`   SERP Domain: ${b.serpDomain || 'N/A'}`);
    console.log(`   SERP Email: ${b.serpEmail || 'NULL'}`);
    console.log(`   Domain Email: ${b.domainEmail || 'NULL'}`);
    console.log('');
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });

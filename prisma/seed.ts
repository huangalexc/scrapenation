import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Create a test job
  const testJob = await prisma.job.create({
    data: {
      businessType: 'restaurant',
      geography: ['CA', 'NY'],
      zipPercentage: 30,
      status: 'COMPLETED',
      totalZips: 10,
      zipsProcessed: 10,
      businessesFound: 25,
      businessesEnriched: 25,
      businessesScraped: 20,
      placesApiCalls: 10,
      customSearchCalls: 25,
      openaiCalls: 25,
      estimatedCost: 0.50,
    },
  });

  console.log('Created test job:', testJob.id);

  // Create sample businesses
  const businesses = await prisma.business.createMany({
    data: [
      {
        placeId: 'test_place_1',
        name: 'The Best Restaurant',
        formattedAddress: '123 Main St, San Francisco, CA 94102',
        latitude: 37.7749,
        longitude: -122.4194,
        rating: 4.5,
        userRatingsTotal: 150,
        priceLevel: 2,
        types: ['restaurant', 'food'],
        businessType: 'restaurant',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        serpDomain: 'thebestrestaurant.com',
        serpDomainConfidence: 85.0,
        serpEmail: 'contact@thebestrestaurant.com',
        serpEmailConfidence: 90.0,
        serpPhone: '+1-415-555-0100',
        serpPhoneConfidence: 95.0,
        domainEmail: 'info@thebestrestaurant.com',
        domainPhone: '+1-415-555-0100',
        jobId: testJob.id,
      },
      {
        placeId: 'test_place_2',
        name: 'Quick Bites Cafe',
        formattedAddress: '456 Market St, San Francisco, CA 94103',
        latitude: 37.7849,
        longitude: -122.4094,
        rating: 4.2,
        userRatingsTotal: 89,
        priceLevel: 1,
        types: ['cafe', 'restaurant'],
        businessType: 'restaurant',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94103',
        serpDomain: 'quickbites.com',
        serpDomainConfidence: 75.0,
        serpEmail: null,
        serpEmailConfidence: null,
        serpPhone: '+1-415-555-0200',
        serpPhoneConfidence: 80.0,
        domainEmail: 'hello@quickbites.com',
        domainPhone: '+1-415-555-0200',
        jobId: testJob.id,
      },
      {
        placeId: 'test_place_3',
        name: 'NYC Pizza Palace',
        formattedAddress: '789 Broadway, New York, NY 10003',
        latitude: 40.7128,
        longitude: -74.0060,
        rating: 4.8,
        userRatingsTotal: 320,
        priceLevel: 2,
        types: ['restaurant', 'pizza'],
        businessType: 'restaurant',
        city: 'New York',
        state: 'NY',
        postalCode: '10003',
        serpDomain: 'nycpizzapalace.com',
        serpDomainConfidence: 92.0,
        serpEmail: 'order@nycpizzapalace.com',
        serpEmailConfidence: 88.0,
        serpPhone: '+1-212-555-0300',
        serpPhoneConfidence: 90.0,
        domainEmail: 'order@nycpizzapalace.com',
        domainPhone: '+1-212-555-0300',
        jobId: testJob.id,
      },
    ],
  });

  console.log('Created businesses:', businesses.count);
  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

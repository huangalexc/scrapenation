import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Clean up extracted email by removing leading/trailing non-email characters
 */
function cleanEmail(email: string): string | null {
  if (!email) return null;

  // First, decode URL-encoded characters like %20 (space)
  let cleaned = email;
  try {
    cleaned = decodeURIComponent(email);
  } catch {
    // If decoding fails, use original
  }

  // Remove spaces that might be in the middle of the email first
  // e.g., "naylorclinic@be llsouth.net" -> "naylorclinic@bellsouth.net"
  cleaned = cleaned.replace(/\s+/g, '');

  // Extract ONLY the email part, ensuring:
  // 1. Local part starts with a letter (not digit/symbol)
  // 2. Domain ends with a known TLD (com, net, org, etc.)
  // This handles cases like:
  // - "704-568-2447admin@chirobryan.com" -> "admin@chirobryan.com"
  // - "info@example.comcall" -> "info@example.com"
  // - "drguglielmo@gmail.comphone" -> "drguglielmo@gmail.com"
  // - "filler@godaddy.combookingsmy" -> "filler@godaddy.com"
  // - "naylorclinic@bellsouth.netnaylorstaff" -> "naylorclinic@bellsouth.net"
  const match = cleaned.match(
    /[A-Za-z][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.(?:com|net|org|edu|gov|mil|co|io|us|uk|ca|au|de|fr|it|es|nl|be|ch|at|se|no|dk|fi|pl|cz|ru|jp|cn|in|br|mx|ar|cl|pe|nz|za|info|biz|name|mobi|pro|aero|asia|cat|coop|jobs|museum|tel|travel|xxx)/
  );
  if (!match) return null;

  return match[0];
}

/**
 * Check if email is a generic/placeholder email
 */
function isGenericEmail(email: string): boolean {
  const lowerEmail = email.toLowerCase();

  const genericPatterns = [
    'noreply',
    'no-reply',
    'donotreply',
    'do-not-reply',
    'example.com',
    'test.com',
    'support@example',
    'info@example',
    'contact@example',
    'user@domain.com',
    'admin@domain.com',
    'email@domain.com',
    'name@domain.com',
    'your@domain.com',
    'youremail@',
    'yourname@',
    'user@',
    'username@',
    '@godaddy.com', // GoDaddy placeholder emails
    'filler@',
    'placeholder@',
    'dummy@',
  ];

  return genericPatterns.some((pattern) => lowerEmail.includes(pattern));
}

async function main() {
  const dryRun = process.argv[2] !== '--apply';

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('   Run with --apply to actually update the database\n');
  } else {
    console.log('⚠️  APPLY MODE - Database will be updated\n');
  }

  // Find all businesses with emails (both SERP and domain emails)
  const businesses = await prisma.business.findMany({
    where: {
      OR: [{ serpEmail: { not: null } }, { domainEmail: { not: null } }],
    },
    select: {
      placeId: true,
      name: true,
      serpEmail: true,
      domainEmail: true,
    },
  });

  console.log(`Found ${businesses.length} businesses with emails\n`);

  let serpEmailsFixed = 0;
  let domainEmailsFixed = 0;
  let serpEmailsRemoved = 0;
  let domainEmailsRemoved = 0;

  const updates: Array<{
    placeId: string;
    name: string;
    field: 'serpEmail' | 'domainEmail';
    oldValue: string;
    newValue: string | null;
    reason: string;
  }> = [];

  for (const business of businesses) {
    // Check SERP email
    if (business.serpEmail) {
      const cleaned = cleanEmail(business.serpEmail);

      if (!cleaned) {
        // Email couldn't be parsed - remove it
        updates.push({
          placeId: business.placeId,
          name: business.name,
          field: 'serpEmail',
          oldValue: business.serpEmail,
          newValue: null,
          reason: 'Could not parse valid email',
        });
        serpEmailsRemoved++;
      } else if (isGenericEmail(cleaned)) {
        // Email is a placeholder - remove it
        updates.push({
          placeId: business.placeId,
          name: business.name,
          field: 'serpEmail',
          oldValue: business.serpEmail,
          newValue: null,
          reason: 'Generic/placeholder email',
        });
        serpEmailsRemoved++;
      } else if (cleaned !== business.serpEmail) {
        // Email was cleaned
        updates.push({
          placeId: business.placeId,
          name: business.name,
          field: 'serpEmail',
          oldValue: business.serpEmail,
          newValue: cleaned,
          reason: 'Cleaned malformed email',
        });
        serpEmailsFixed++;
      }
    }

    // Check domain email
    if (business.domainEmail) {
      const cleaned = cleanEmail(business.domainEmail);

      if (!cleaned) {
        // Email couldn't be parsed - remove it
        updates.push({
          placeId: business.placeId,
          name: business.name,
          field: 'domainEmail',
          oldValue: business.domainEmail,
          newValue: null,
          reason: 'Could not parse valid email',
        });
        domainEmailsRemoved++;
      } else if (isGenericEmail(cleaned)) {
        // Email is a placeholder - remove it
        updates.push({
          placeId: business.placeId,
          name: business.name,
          field: 'domainEmail',
          oldValue: business.domainEmail,
          newValue: null,
          reason: 'Generic/placeholder email',
        });
        domainEmailsRemoved++;
      } else if (cleaned !== business.domainEmail) {
        // Email was cleaned
        updates.push({
          placeId: business.placeId,
          name: business.name,
          field: 'domainEmail',
          oldValue: business.domainEmail,
          newValue: cleaned,
          reason: 'Cleaned malformed email',
        });
        domainEmailsFixed++;
      }
    }
  }

  console.log('📊 Summary:');
  console.log(`  SERP emails fixed: ${serpEmailsFixed}`);
  console.log(`  SERP emails removed: ${serpEmailsRemoved}`);
  console.log(`  Domain emails fixed: ${domainEmailsFixed}`);
  console.log(`  Domain emails removed: ${domainEmailsRemoved}`);
  console.log(`  Total changes: ${updates.length}\n`);

  if (updates.length > 0) {
    console.log('📝 Sample changes (first 20):');
    updates.slice(0, 20).forEach((update) => {
      console.log(`  ${update.name}`);
      console.log(`    ${update.field}: "${update.oldValue}" -> "${update.newValue || 'NULL'}"`);
      console.log(`    Reason: ${update.reason}\n`);
    });

    if (updates.length > 20) {
      console.log(`  ... and ${updates.length - 20} more changes\n`);
    }
  }

  if (!dryRun && updates.length > 0) {
    console.log('🔄 Applying updates to database...');

    let updateCount = 0;
    for (const update of updates) {
      await prisma.business.update({
        where: { placeId: update.placeId },
        data: {
          [update.field]: update.newValue,
        },
      });
      updateCount++;

      if (updateCount % 100 === 0) {
        console.log(`  Updated ${updateCount}/${updates.length} businesses...`);
      }
    }

    console.log(`✅ Successfully updated ${updateCount} businesses`);
  } else if (dryRun && updates.length > 0) {
    console.log('💡 To apply these changes, run:');
    console.log('   npx tsx scripts/fix-malformed-emails.ts --apply');
  } else {
    console.log('✅ No changes needed - all emails are already clean!');
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

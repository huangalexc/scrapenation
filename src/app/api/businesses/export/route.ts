import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering - don't prerender during build
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters (no schema validation for export - we need unlimited pageSize)
    const filters = {
      state: searchParams.get('state') || undefined,
      businessType: searchParams.get('businessType') || undefined,
      hasEmail: searchParams.get('hasEmail') === 'true' ? true : undefined,
      hasPhone: searchParams.get('hasPhone') === 'true' ? true : undefined,
      sortBy: (searchParams.get('sortBy') as any) || 'name',
      sortOrder: (searchParams.get('sortOrder') as any) || 'asc',
    };

    // Build where clause - filter by user access via UserBusiness junction table
    const where: any = {
      userBusinesses: {
        some: {
          userId: session.user.id,
        },
      },
    };

    if (filters.state) {
      where.state = filters.state;
    }

    if (filters.businessType) {
      where.businessType = {
        contains: filters.businessType,
        mode: 'insensitive',
      };
    }

    if (filters.hasEmail) {
      where.OR = [{ serpEmail: { not: null } }, { domainEmail: { not: null } }];
    }

    if (filters.hasPhone) {
      where.OR = [
        ...(where.OR || []),
        { serpPhone: { not: null } },
        { domainPhone: { not: null } },
      ];
    }

    // Fetch all matching businesses (only those accessible to this user)
    const businesses = await prisma.business.findMany({
      where,
      orderBy: {
        [filters.sortBy]: filters.sortOrder,
      },
    });

    // Generate CSV
    const csv = generateCSV(businesses);

    // Return CSV file
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="businesses-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export businesses' },
      { status: 500 }
    );
  }
}

function generateCSV(businesses: any[]): string {
  // CSV headers - simplified to show combined email/phone columns
  const headers = [
    'Name',
    'City',
    'State',
    'Rating',
    'Email',
    'Phone',
    'Formatted Address',
  ];

  // Deduplicate by unique (Email, Phone) combination - keep first occurrence
  const seen = new Set<string>();
  const deduplicatedBusinesses = businesses.filter((b) => {
    const email = b.domainEmail || b.serpEmail || '';
    const phone = b.domainPhone || b.serpPhone || '';
    const key = `${email}|${phone}`;

    // Skip if we've seen this (email, phone) combination before
    if (seen.has(key)) {
      return false;
    }

    // Keep this business and mark combination as seen
    seen.add(key);
    return true;
  });

  // CSV rows - use coalesce logic (domain first, fallback to SERP)
  const rows = deduplicatedBusinesses.map((b) => [
    escapeCsvField(b.name),
    escapeCsvField(b.city || ''),
    escapeCsvField(b.state || ''),
    b.rating || '',
    escapeCsvField(b.domainEmail || b.serpEmail || ''),
    escapeCsvField(b.domainPhone || b.serpPhone || ''),
    escapeCsvField(b.formattedAddress || ''),
  ]);

  // Combine headers and rows
  const csvLines = [headers.join(','), ...rows.map((row) => row.join(','))];

  return csvLines.join('\n');
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

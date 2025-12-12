import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { businessFilterSchema } from '@/lib/schemas/job-schemas';

// Force dynamic rendering - don't prerender during build
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const params: any = {
      page: 1,
      pageSize: 100000, // Get all for export
    };

    if (searchParams.get('state')) params.state = searchParams.get('state');
    if (searchParams.get('businessType')) params.businessType = searchParams.get('businessType');
    if (searchParams.get('minRating')) params.minRating = parseFloat(searchParams.get('minRating')!);
    if (searchParams.get('maxRating')) params.maxRating = parseFloat(searchParams.get('maxRating')!);
    if (searchParams.get('minDomainConfidence'))
      params.minDomainConfidence = parseFloat(searchParams.get('minDomainConfidence')!);
    if (searchParams.get('minEmailConfidence'))
      params.minEmailConfidence = parseFloat(searchParams.get('minEmailConfidence')!);
    if (searchParams.get('minPhoneConfidence'))
      params.minPhoneConfidence = parseFloat(searchParams.get('minPhoneConfidence')!);
    if (searchParams.get('hasEmail')) params.hasEmail = searchParams.get('hasEmail') === 'true';
    if (searchParams.get('hasPhone')) params.hasPhone = searchParams.get('hasPhone') === 'true';
    if (searchParams.get('sortBy')) params.sortBy = searchParams.get('sortBy');
    if (searchParams.get('sortOrder')) params.sortOrder = searchParams.get('sortOrder');

    const filters = businessFilterSchema.parse(params);

    // Build where clause (same as getBusinesses)
    const where: any = {};

    if (filters.state) {
      where.state = filters.state;
    }

    if (filters.businessType) {
      where.businessType = {
        contains: filters.businessType,
        mode: 'insensitive',
      };
    }

    if (filters.minRating !== undefined) {
      where.rating = { ...where.rating, gte: filters.minRating };
    }

    if (filters.maxRating !== undefined) {
      where.rating = { ...where.rating, lte: filters.maxRating };
    }

    if (filters.minDomainConfidence !== undefined) {
      where.serpDomainConfidence = { gte: filters.minDomainConfidence };
    }

    if (filters.minEmailConfidence !== undefined) {
      where.serpEmailConfidence = { gte: filters.minEmailConfidence };
    }

    if (filters.minPhoneConfidence !== undefined) {
      where.serpPhoneConfidence = { gte: filters.minPhoneConfidence };
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

    // Fetch all matching businesses
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
  // CSV headers
  const headers = [
    'Name',
    'City',
    'State',
    'Rating',
    'SERP Domain',
    'SERP Email',
    'SERP Email Confidence',
    'SERP Phone',
    'SERP Phone Confidence',
    'Domain Email',
    'Domain Phone',
    'Formatted Address',
  ];

  // CSV rows
  const rows = businesses.map((b) => [
    escapeCsvField(b.name),
    escapeCsvField(b.city || ''),
    escapeCsvField(b.state || ''),
    b.rating || '',
    escapeCsvField(b.serpDomain || ''),
    escapeCsvField(b.serpEmail || ''),
    b.serpEmailConfidence || '',
    escapeCsvField(b.serpPhone || ''),
    b.serpPhoneConfidence || '',
    escapeCsvField(b.domainEmail || ''),
    escapeCsvField(b.domainPhone || ''),
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

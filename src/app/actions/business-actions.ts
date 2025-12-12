'use server';

import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { businessFilterSchema } from '@/lib/schemas/job-schemas';
import { createErrorResponse } from '@/lib/utils/errors';
import type { Business } from '@prisma/client';

export type ActionResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type BusinessesResult = {
  businesses: Business[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getBusinesses(input: unknown): Promise<ActionResult<BusinessesResult>> {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    const filters = businessFilterSchema.parse(input);

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
      where.OR = [
        { serpEmail: { not: null } },
        { domainEmail: { not: null } },
      ];
    }

    if (filters.hasPhone) {
      where.OR = [
        ...(where.OR || []),
        { serpPhone: { not: null } },
        { domainPhone: { not: null } },
      ];
    }

    // Get total count
    const total = await prisma.business.count({ where });

    // Get paginated results
    const businesses = await prisma.business.findMany({
      where,
      orderBy: {
        [filters.sortBy]: filters.sortOrder,
      },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    });

    const totalPages = Math.ceil(total / filters.pageSize);

    return {
      success: true,
      data: {
        businesses,
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        totalPages,
      },
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return {
      success: false,
      error: errorResponse.error.message,
    };
  }
}

export async function getBusinessById(id: string): Promise<ActionResult<Business>> {
  try {
    const business = await prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      return {
        success: false,
        error: 'Business not found',
      };
    }

    return {
      success: true,
      data: business,
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return {
      success: false,
      error: errorResponse.error.message,
    };
  }
}

export async function getAvailableStates(): Promise<ActionResult<string[]>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    const result = await prisma.business.findMany({
      select: { state: true },
      distinct: ['state'],
      where: {
        state: { not: null },
        userBusinesses: {
          some: {
            userId: session.user.id,
          },
        },
      },
      orderBy: { state: 'asc' },
    });

    const states = result.map((r) => r.state).filter(Boolean) as string[];

    return {
      success: true,
      data: states,
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return {
      success: false,
      error: errorResponse.error.message,
    };
  }
}

export async function getAvailableBusinessTypes(): Promise<ActionResult<string[]>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized',
      };
    }

    const result = await prisma.business.findMany({
      select: { businessType: true },
      distinct: ['businessType'],
      where: {
        userBusinesses: {
          some: {
            userId: session.user.id,
          },
        },
      },
      orderBy: { businessType: 'asc' },
    });

    const types = result.map((r) => r.businessType);

    return {
      success: true,
      data: types,
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return {
      success: false,
      error: errorResponse.error.message,
    };
  }
}


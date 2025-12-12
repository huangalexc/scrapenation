'use server';

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
    const filters = businessFilterSchema.parse(input);

    // Build where clause
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
    const result = await prisma.business.findMany({
      select: { state: true },
      distinct: ['state'],
      where: { state: { not: null } },
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
    const result = await prisma.business.findMany({
      select: { businessType: true },
      distinct: ['businessType'],
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

export async function deleteBusiness(id: string): Promise<ActionResult<void>> {
  try {
    await prisma.business.delete({
      where: { id },
    });

    return {
      success: true,
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return {
      success: false,
      error: errorResponse.error.message,
    };
  }
}

export async function deleteBusinesses(ids: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    const result = await prisma.business.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });

    return {
      success: true,
      data: { count: result.count },
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return {
      success: false,
      error: errorResponse.error.message,
    };
  }
}

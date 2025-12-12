import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        businessType: true,
        geography: true,
        zipPercentage: true,
        status: true,
        totalZips: true,
        zipsProcessed: true,
        businessesFound: true,
        businessesEnriched: true,
        businessesScraped: true,
        placesApiCalls: true,
        customSearchCalls: true,
        openaiCalls: true,
        estimatedCost: true,
        errorsEncountered: true,
        errorLog: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Ensure user owns this job
    if (job.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Remove userId from response
    const { userId, ...jobData } = job;

    return NextResponse.json(jobData);
  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

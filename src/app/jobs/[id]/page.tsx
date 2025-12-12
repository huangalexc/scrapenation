import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { JobDetailClient } from '@/components/job-detail-client';

interface JobDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
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
    notFound();
  }

  // Ensure user owns this job
  if (job.userId !== session.user.id) {
    redirect('/jobs');
  }

  // Remove userId and convert dates to strings for client component
  const { userId, ...jobData } = job;
  const jobForClient = {
    ...jobData,
    createdAt: jobData.createdAt.toISOString(),
    updatedAt: jobData.updatedAt.toISOString(),
  };

  return <JobDetailClient initialJob={jobForClient} />;
}

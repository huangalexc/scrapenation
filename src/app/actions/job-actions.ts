'use server';

import { auth } from '@/lib/auth/auth';
import { jobOrchestratorService } from '@/lib/services/job-orchestrator-service';
import { createJobSchema } from '@/lib/schemas/job-schemas';
import { createErrorResponse } from '@/lib/utils/errors';
import type { Job } from '@prisma/client';

export type ActionResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function createJob(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  try {
    const session = await auth();

    if (!session?.user) {
      return {
        success: false,
        error: 'You must be logged in to create a job',
      };
    }

    const validated = createJobSchema.parse(input);

    const result = await jobOrchestratorService.startJob({
      userId: session.user.id,
      businessType: validated.businessType,
      geography: validated.geography,
      zipPercentage: validated.zipPercentage,
      minDomainConfidence: validated.minDomainConfidence,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      data: { jobId: result.jobId! },
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return {
      success: false,
      error: errorResponse.error.message,
    };
  }
}

export async function getJobStatus(jobId: string): Promise<ActionResult<Job>> {
  try {
    const job = await jobOrchestratorService.getJobStatus(jobId);

    if (!job) {
      return {
        success: false,
        error: 'Job not found',
      };
    }

    return {
      success: true,
      data: job,
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return {
      success: false,
      error: errorResponse.error.message,
    };
  }
}

export async function getAllJobs(): Promise<ActionResult<Job[]>> {
  try {
    const jobs = await jobOrchestratorService.getAllJobs();

    return {
      success: true,
      data: jobs,
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error);
    return {
      success: false,
      error: errorResponse.error.message,
    };
  }
}

export async function pauseJob(jobId: string): Promise<ActionResult<void>> {
  try {
    await jobOrchestratorService.pauseJob(jobId);

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

export async function cancelJob(jobId: string): Promise<ActionResult<void>> {
  try {
    await jobOrchestratorService.cancelJob(jobId);

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

'use server';

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
    const validated = createJobSchema.parse(input);

    const jobId = await jobOrchestratorService.startJob({
      businessType: validated.businessType,
      geography: validated.geography,
      zipPercentage: validated.zipPercentage,
      minDomainConfidence: validated.minDomainConfidence,
    });

    return {
      success: true,
      data: { jobId },
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

#!/usr/bin/env node

/**
 * Railway Background Worker
 * Polls for pending jobs and processes them
 */

import { PrismaClient } from '@prisma/client';
import { jobOrchestratorService } from '../src/lib/services/job-orchestrator-service';

const prisma = new PrismaClient();

const POLL_INTERVAL = 5000; // Poll every 5 seconds
const MAX_CONCURRENT_JOBS = 3; // Process up to 3 jobs simultaneously
const STALL_TIMEOUT = 120000; // 120 seconds (2 minutes)

class WorkerService {
  private isRunning = false;
  private activeJobs = new Set<string>();

  async start() {
    console.log('[Worker] Starting Railway background worker...');
    console.log('[Worker] Polling interval:', POLL_INTERVAL, 'ms');
    console.log('[Worker] Max concurrent jobs:', MAX_CONCURRENT_JOBS);

    this.isRunning = true;
    this.poll();
  }

  async stop() {
    console.log('[Worker] Stopping worker...');
    this.isRunning = false;
  }

  private async poll() {
    while (this.isRunning) {
      try {
        await this.processJobs();
      } catch (error) {
        console.error('[Worker] Error processing jobs:', error);
      }

      // Wait before next poll
      await this.sleep(POLL_INTERVAL);
    }
  }

  private async processJobs() {
    // Check if we can process more jobs
    if (this.activeJobs.size >= MAX_CONCURRENT_JOBS) {
      return;
    }

    // Find pending jobs
    const pendingJobs = await prisma.job.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: MAX_CONCURRENT_JOBS - this.activeJobs.size,
    });

    // Check for stalled RUNNING jobs
    const stalledJobs = await prisma.job.findMany({
      where: {
        status: 'RUNNING',
        lastProgressAt: {
          lt: new Date(Date.now() - STALL_TIMEOUT),
        },
      },
    });

    if (stalledJobs.length > 0) {
      console.log(`[Worker] Found ${stalledJobs.length} stalled job(s) - resetting to PENDING for resume`);

      for (const stalledJob of stalledJobs) {
        console.log(`[Worker] Job ${stalledJob.id} stalled at step "${stalledJob.currentStep}" - will resume`);

        // Reset to PENDING so it will be picked up and resumed
        await prisma.job.update({
          where: { id: stalledJob.id },
          data: { status: 'PENDING' },
        });
      }
    }

    if (pendingJobs.length === 0) {
      return;
    }

    console.log(`[Worker] Found ${pendingJobs.length} pending job(s)`);

    // Process each job
    for (const job of pendingJobs) {
      this.processJob(job.id);
    }
  }

  private async processJob(jobId: string) {
    if (this.activeJobs.has(jobId)) {
      return;
    }

    this.activeJobs.add(jobId);
    console.log(`[Worker] Starting job ${jobId}`);

    try {
      // Get job details
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        console.error(`[Worker] Job ${jobId} not found`);
        return;
      }

      // Mark as running
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'RUNNING' },
      });

      // Process the job using the orchestrator
      // Note: We call the private runPipeline method via a new public method
      await this.runJobPipeline(job);

      console.log(`[Worker] Completed job ${jobId}`);
    } catch (error) {
      console.error(`[Worker] Error processing job ${jobId}:`, error);

      // Mark job as failed
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorLog: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async runJobPipeline(job: any) {
    // Import and use the job orchestrator service
    const { JobOrchestratorService } = await import(
      '../src/lib/services/job-orchestrator-service'
    );

    const orchestrator = new JobOrchestratorService();

    // Execute the job using the public method
    await orchestrator.executeJob(job.id);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Handle graceful shutdown
const worker = new WorkerService();

process.on('SIGTERM', async () => {
  console.log('[Worker] Received SIGTERM, shutting down gracefully...');
  await worker.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Worker] Received SIGINT, shutting down gracefully...');
  await worker.stop();
  await prisma.$disconnect();
  process.exit(0);
});

// Start the worker
worker.start().catch((error) => {
  console.error('[Worker] Failed to start:', error);
  process.exit(1);
});

import { prisma } from '@/lib/prisma';

export interface TierLimits {
  maxJobs: number;
  maxZipsPerJob: number;
  maxStatesPerJob: number;
}

export const TIER_LIMITS: Record<'FREE' | 'PRO', TierLimits> = {
  FREE: {
    maxJobs: 1,
    maxZipsPerJob: 5,
    maxStatesPerJob: 1,
  },
  PRO: {
    maxJobs: Infinity,
    maxZipsPerJob: Infinity,
    maxStatesPerJob: Infinity,
  },
};

export class TierLimitsService {
  /**
   * Check if a user can create a new job
   */
  async canCreateJob(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true, jobsCreated: true },
    });

    if (!user) {
      return { allowed: false, reason: 'User not found' };
    }

    const limits = TIER_LIMITS[user.tier];

    if (user.jobsCreated >= limits.maxJobs) {
      return {
        allowed: false,
        reason: `You have reached the maximum number of jobs for your tier (${limits.maxJobs}). Upgrade to Pro for unlimited jobs.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Validate job configuration against tier limits
   */
  async validateJobConfig(
    userId: string,
    config: {
      geography: string[];
      zipCodes?: string[];
    }
  ): Promise<{ valid: boolean; reason?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true },
    });

    if (!user) {
      return { valid: false, reason: 'User not found' };
    }

    const limits = TIER_LIMITS[user.tier];

    // Check state limit
    const states = config.geography.filter(g => g !== 'nationwide');
    if (states.length > limits.maxStatesPerJob) {
      return {
        valid: false,
        reason: `Free tier is limited to ${limits.maxStatesPerJob} state per job. You selected ${states.length} states.`,
      };
    }

    // Check if nationwide is selected (not allowed for free tier)
    if (config.geography.includes('nationwide') && user.tier === 'FREE') {
      return {
        valid: false,
        reason: 'Nationwide searches are not available on the free tier. Please select a single state.',
      };
    }

    // Check ZIP code limit (if provided)
    if (config.zipCodes && config.zipCodes.length > limits.maxZipsPerJob) {
      return {
        valid: false,
        reason: `Free tier is limited to ${limits.maxZipsPerJob} ZIP codes per job. You selected ${config.zipCodes.length} ZIP codes.`,
      };
    }

    return { valid: true };
  }

  /**
   * Increment the user's job counter
   */
  async incrementJobCount(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { jobsCreated: { increment: 1 } },
    });
  }

  /**
   * Get user's current tier and usage
   */
  async getUserTierInfo(userId: string): Promise<{
    tier: 'FREE' | 'PRO';
    jobsCreated: number;
    limits: TierLimits;
  } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true, jobsCreated: true },
    });

    if (!user) {
      return null;
    }

    return {
      tier: user.tier,
      jobsCreated: user.jobsCreated,
      limits: TIER_LIMITS[user.tier],
    };
  }
}

export const tierLimitsService = new TierLimitsService();

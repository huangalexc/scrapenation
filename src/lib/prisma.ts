import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Get connection string
const connectionString = process.env.DATABASE_URL;

// Detect if we're on Vercel (which supports WebSockets for Neon adapter)
// Railway doesn't support WebSockets, so use standard Prisma client there
const isVercel = process.env.VERCEL === '1';

// Create Prisma client
// During build, DATABASE_URL might not be available - that's OK since we don't actually connect during build
export const prisma =
  globalForPrisma.prisma ??
  (() => {
    // Use a mock DATABASE_URL during build if not provided
    const actualConnectionString = connectionString || 'postgresql://user:password@localhost:5432/db';

    // Log a warning if using mock connection string
    if (!connectionString) {
      console.warn('[Prisma] DATABASE_URL not available, using mock connection for build');
    }

    const config: any = {
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    };

    // Only use Neon adapter on Vercel (has WebSocket support) AND when DATABASE_URL is available
    // Railway will use standard Prisma client with pooled connection
    if (isVercel && connectionString) {
      // When using adapter, connection string is passed to adapter, not datasources
      config.adapter = new PrismaNeon({ connectionString });
    } else {
      // Standard Prisma client (Railway) or build-time - use datasources
      config.datasources = {
        db: {
          url: actualConnectionString,
        },
      };
    }

    return new PrismaClient(config);
  })();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Retry database operation with exponential backoff
 * Handles connection errors that can occur during long-running jobs
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if it's a connection error
      const isConnectionError =
        error.code === 'P1001' || // Can't reach database server
        error.code === 'P1002' || // Database server timeout
        error.code === 'P1008' || // Operations timed out
        error.code === 'P1017' || // Server has closed the connection
        error.message?.includes('Connection') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ETIMEDOUT');

      if (!isConnectionError || attempt === maxRetries) {
        // Not a connection error or out of retries
        throw error;
      }

      // Calculate exponential backoff delay
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `[Prisma] ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`
      );
      console.warn(`[Prisma] Retrying in ${delayMs}ms...`);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Try to reconnect by disconnecting and letting Prisma reconnect on next query
      try {
        await prisma.$disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
      }
    }
  }

  throw lastError;
}

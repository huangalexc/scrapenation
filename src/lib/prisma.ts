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
    // If DATABASE_URL is not available during build, return a mock client
    // This prevents build failures while collecting route metadata
    if (!connectionString) {
      console.warn('[Prisma] DATABASE_URL not available, using mock client for build');
      return new PrismaClient({
        datasources: {
          db: {
            url: 'postgresql://user:password@localhost:5432/db',
          },
        },
      });
    }

    const config: any = {
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    };

    // Only use Neon adapter on Vercel (has WebSocket support) AND when DATABASE_URL is available
    // Railway will use standard Prisma client with pooled connection
    if (isVercel) {
      config.adapter = new PrismaNeon({ connectionString });
    }

    return new PrismaClient(config);
  })();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

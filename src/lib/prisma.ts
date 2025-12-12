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
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Only use Neon adapter on Vercel (has WebSocket support)
    // Railway will use standard Prisma client with pooled connection
    ...(connectionString && isVercel && { adapter: new PrismaNeon({ connectionString }) }),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Get connection string
const connectionString = process.env.DATABASE_URL;

// Create Prisma client (adapter only if DATABASE_URL is available)
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(connectionString && { adapter: new PrismaNeon({ connectionString }) }),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

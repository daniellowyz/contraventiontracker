import { PrismaClient } from '@prisma/client';

// Global variable to prevent multiple instances in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Create Prisma client - use standard connection (Prisma handles pooling)
function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  console.log(`[Database] Initializing Prisma client`);
  console.log(`[Database] URL contains pooler: ${databaseUrl.includes('pooler.supabase.com')}`);

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

// Use global instance in development to prevent hot-reload issues
// In production, create a new instance
export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;

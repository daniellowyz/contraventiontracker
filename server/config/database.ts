import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Lazy initialization for Vercel serverless
let prismaInstance: PrismaClient | null = null;

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Check if using Supabase pooler (recommended for serverless)
  const isPoolerUrl = connectionString.includes('pooler.supabase.com');
  console.log(`[Database] Connecting to ${isPoolerUrl ? 'Supabase pooler' : 'direct connection'}`);

  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    // Optimize for serverless - minimal connections, fast timeout
    max: isPoolerUrl ? 1 : 3, // Single connection when using external pooler
    idleTimeoutMillis: 5000, // Close idle connections quickly
    connectionTimeoutMillis: 4000, // Fail fast - need to leave time for retry
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: ['error'],
  });
}

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = createPrismaClient();
  }
  return prismaInstance;
}

// For backwards compatibility
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as any)[prop];
  },
});

export default prisma;

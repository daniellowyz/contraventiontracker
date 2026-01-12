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

  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    // Optimize for serverless - minimal connections, fast timeout
    max: 3, // Max connections in pool
    idleTimeoutMillis: 10000, // Close idle connections after 10s
    connectionTimeoutMillis: 5000, // Fail fast if can't connect in 5s
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

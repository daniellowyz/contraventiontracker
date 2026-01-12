/**
 * Bootstrap script to make a user an admin
 * Usage: npx ts-node scripts/make-admin.ts <email>
 * Example: npx ts-node scripts/make-admin.ts daniellow@open.gov.sg
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || '';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function makeAdmin(email: string) {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      console.error(`User not found: ${normalizedEmail}`);
      console.log('Note: The user must first log in (create an account) before being made an admin.');
      process.exit(1);
    }

    if (user.role === 'ADMIN') {
      console.log(`User ${normalizedEmail} is already an admin.`);
      process.exit(0);
    }

    // Update to admin
    await prisma.user.update({
      where: { email: normalizedEmail },
      data: { role: 'ADMIN' },
    });

    console.log(`Successfully made ${normalizedEmail} an admin!`);
    console.log(`User: ${user.name} (${user.employeeId})`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error('Usage: npx ts-node scripts/make-admin.ts <email>');
  console.error('Example: npx ts-node scripts/make-admin.ts daniellow@open.gov.sg');
  process.exit(1);
}

makeAdmin(email);

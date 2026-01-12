import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting status migration...');
  console.log('This will update all contraventions without approval attachments to PENDING_UPLOAD status.\n');

  // Find all contraventions that don't have approval PDF and are not already PENDING_UPLOAD
  const contraventionsToUpdate = await prisma.contravention.findMany({
    where: {
      OR: [
        { approvalPdfUrl: null },
        { approvalPdfUrl: '' },
      ],
      NOT: {
        status: 'PENDING_UPLOAD',
      },
    },
    select: {
      id: true,
      referenceNo: true,
      status: true,
      approvalPdfUrl: true,
    },
  });

  console.log(`Found ${contraventionsToUpdate.length} contraventions to update:\n`);

  if (contraventionsToUpdate.length === 0) {
    console.log('No contraventions need to be updated.');
    return;
  }

  // Log which contraventions will be updated
  for (const c of contraventionsToUpdate) {
    console.log(`  - ${c.referenceNo}: ${c.status} → PENDING_UPLOAD`);
  }

  console.log('\nUpdating...');

  // Bulk update all matching contraventions
  const result = await prisma.contravention.updateMany({
    where: {
      OR: [
        { approvalPdfUrl: null },
        { approvalPdfUrl: '' },
      ],
      NOT: {
        status: 'PENDING_UPLOAD',
      },
    },
    data: {
      status: 'PENDING_UPLOAD',
    },
  });

  console.log(`\nSuccessfully updated ${result.count} contraventions to PENDING_UPLOAD status.`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

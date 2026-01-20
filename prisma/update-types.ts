// Script to update contravention types
// Uses standard Prisma client (no adapter needed for simple operations)

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  console.log('Updating contravention types...');

  // New contravention types (January 2026)
  const contraventionTypes = [
    {
      category: 'DC_PROCUREMENT',
      name: 'No/Incorrect Approval of Requirement (AOR) before Purchase',
      defaultPoints: 3,
      isOthers: false,
    },
    {
      category: 'DC_PROCUREMENT',
      name: 'Vendor on AOR Differs from Actual Vendor Buy (e.g. Vendor, Date, Value)',
      defaultPoints: 4,
      isOthers: false,
    },
    {
      category: 'DC_PROCUREMENT',
      name: 'Lapse in Contract Oversight Resulting in Contravention',
      defaultPoints: 5,
      isOthers: false,
    },
    {
      category: 'MANPOWER',
      name: 'Manpower extension without PCPO approval',
      defaultPoints: 3,
      isOthers: false,
    },
    {
      category: 'SIGNATORY',
      name: 'Inappropriate Signatory',
      defaultPoints: 2,
      isOthers: false,
    },
    {
      category: 'DC_PROCUREMENT',
      name: 'Vendor differs from the AOR; but item purchased remains the same',
      defaultPoints: 1,
      isOthers: false,
    },
    {
      category: 'SVP',
      name: 'Late Claims >90 days',
      defaultPoints: 1,
      isOthers: false,
    },
    {
      category: 'MULTIPLE',
      name: 'Multiple Contraventions',
      description: 'Points split based on individual contravention categories',
      defaultPoints: 5,
      isOthers: false,
    },
    {
      category: 'OTHER',
      name: 'Others',
      description: 'Other contraventions not covered by standard types. Admin can adjust points.',
      defaultPoints: 0,
      isOthers: true,
    },
  ];

  for (const type of contraventionTypes) {
    await prisma.contraventionType.upsert({
      where: { name: type.name },
      update: {
        category: type.category,
        defaultPoints: type.defaultPoints,
        description: type.description,
        isOthers: type.isOthers,
        isActive: true,
      },
      create: type,
    });
    console.log(`  ✓ ${type.name}`);
  }

  // Deactivate old types that are no longer used
  const oldTypeNames = [
    'Missing AOR',
    'Different vendor on AOR versus purchase',
    'Late Personal Claims',
    'Ownership Lapse',
    'Process-driven exception',
    'Insufficient AOR value for manpower blanket',
    'No approval before purchase',
    'Signatory Contravention',
    'Vendor AOR differs from actual vendor',
  ];

  const deactivated = await prisma.contraventionType.updateMany({
    where: { name: { in: oldTypeNames } },
    data: { isActive: false },
  });

  console.log(`\nDeactivated ${deactivated.count} old types`);
  console.log('Contravention types updated successfully!');
}

main()
  .catch((e) => {
    console.error('Update failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

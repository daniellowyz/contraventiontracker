import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seed...');

  // Create Departments
  const departments = [
    'People Team',
    'TEALS',
    'FormSG',
    'Marketing',
    'Isomer',
    'Armoury',
    'Product Operations',
    'DGS',
    'Developer Relations',
    'OGP',
    'BFG',
    'Personal',
  ];

  for (const name of departments) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('Departments created');

  // Create Contravention Types (Updated January 2026)
  // Reference: User-provided contravention type list with points
  const contraventionTypes = [
    // 3 points - AOR issues
    {
      category: 'DC_PROCUREMENT',
      name: 'No/Incorrect Approval of Requirement (AOR) before Purchase',
      defaultPoints: 3,
      isOthers: false,
    },
    // 4 points - Vendor mismatch (significant)
    {
      category: 'DC_PROCUREMENT',
      name: 'Vendor on AOR Differs from Actual Vendor Buy (e.g. Vendor, Date, Value)',
      defaultPoints: 4,
      isOthers: false,
    },
    // 5 points - Contract oversight lapse
    {
      category: 'DC_PROCUREMENT',
      name: 'Lapse in Contract Oversight Resulting in Contravention',
      defaultPoints: 5,
      isOthers: false,
    },
    // 3 points - Manpower extension
    {
      category: 'MANPOWER',
      name: 'Manpower extension without PCPO approval',
      defaultPoints: 3,
      isOthers: false,
    },
    // 2 points - Signatory issue
    {
      category: 'SIGNATORY',
      name: 'Inappropriate Signatory',
      defaultPoints: 2,
      isOthers: false,
    },
    // 1 point - Minor vendor mismatch (same item)
    {
      category: 'DC_PROCUREMENT',
      name: 'Vendor differs from the AOR; but item purchased remains the same',
      defaultPoints: 1,
      isOthers: false,
    },
    // 1 point - Late claims
    {
      category: 'SVP',
      name: 'Late Claims >90 days',
      defaultPoints: 1,
      isOthers: false,
    },
    // Multiple Contraventions - varies based on categories
    {
      category: 'MULTIPLE',
      name: 'Multiple Contraventions',
      description: 'Points split based on individual contravention categories',
      defaultPoints: 5,  // Base points, actual determined by sub-contraventions
      isOthers: false,
    },
    // 0 points - Others (admin can adjust points)
    {
      category: 'OTHER',
      name: 'Others',
      description: 'Other contraventions not covered by standard types. Admin can adjust points.',
      defaultPoints: 0,
      isOthers: true,  // Special flag for "Others" type
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
      },
      create: type,
    });
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

  await prisma.contraventionType.updateMany({
    where: { name: { in: oldTypeNames } },
    data: { isActive: false },
  });

  console.log('Contravention types created/updated');

  // Create the single training course (triggered at 5 points)
  await prisma.course.upsert({
    where: { name: 'Procurement Compliance Course' },
    update: {},
    create: {
      name: 'Procurement Compliance Course',
      description: 'Mandatory training course covering procurement policies, approval processes, and compliance requirements.',
      durationHours: 2,
      provider: 'Internal - Finance Team',
      validityMonths: 24,
      triggerPoints: 5,
      pointsCredit: 1,
    },
  });
  console.log('Training course created');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const adminDept = await prisma.department.findFirst({ where: { name: 'OGP' } });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@ogp.gov.sg' },
    update: {},
    create: {
      employeeId: 'ADMIN001',
      email: 'admin@ogp.gov.sg',
      passwordHash: adminPassword,
      name: 'System Admin',
      role: 'ADMIN',
      departmentId: adminDept?.id,
    },
  });

  // Create points record for admin
  await prisma.employeePoints.upsert({
    where: { employeeId: adminUser.id },
    update: {},
    create: {
      employeeId: adminUser.id,
      totalPoints: 0,
    },
  });

  console.log('Admin user created');
  console.log('Email: admin@ogp.gov.sg');
  console.log('Password: admin123');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

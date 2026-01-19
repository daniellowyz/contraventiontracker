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

  // Create Contravention Types (using points-based system)
  const contraventionTypes = [
    { category: 'DC_PROCUREMENT', name: 'Missing AOR', defaultPoints: 3 },
    { category: 'SVP', name: 'Different vendor on AOR versus purchase', defaultPoints: 3 },
    { category: 'SVP', name: 'Late Personal Claims', defaultPoints: 1 },
    { category: 'DC_PROCUREMENT', name: 'Ownership Lapse', defaultPoints: 2 },
    { category: 'DC_PROCUREMENT', name: 'Process-driven exception', defaultPoints: 0 },
    { category: 'DC_PROCUREMENT', name: 'Multiple Contraventions', defaultPoints: 5 },
    { category: 'MANPOWER', name: 'Insufficient AOR value for manpower blanket', defaultPoints: 3 },
    { category: 'DC_PROCUREMENT', name: 'No approval before purchase', defaultPoints: 5 },
    { category: 'SIGNATORY', name: 'Signatory Contravention', defaultPoints: 5 },
    { category: 'DC_PROCUREMENT', name: 'Vendor AOR differs from actual vendor', defaultPoints: 3 },
    { category: 'MANPOWER', name: 'Manpower extension without PCPO approval', defaultPoints: 3 },
    { category: 'DC_PROCUREMENT', name: 'Others', defaultPoints: 2, isOthers: true },
  ];

  for (const type of contraventionTypes) {
    await prisma.contraventionType.upsert({
      where: { name: type.name },
      update: type,
      create: type,
    });
  }
  console.log('Contravention types created');

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

import { PrismaClient, ContraventionStatus, EscalationLevel } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import * as path from 'path';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

// Mapping from Excel contravention type names to our database names
const typeMapping: Record<string, string> = {
  'Missing AOR': 'Missing AOR',
  'Different vendor on AOR versus purchase': 'Different vendor on AOR versus purchase',
  'Late Personal Claims': 'Late Personal Claims',
  'Ownership Lapse': 'Ownership Lapse',
  'Process-driven exception': 'Process-driven exception',
  'Multiple Contraventions': 'Multiple Contraventions',
  'Insufficient AOR value for manpower blanket': 'Insufficient AOR value for manpower blanket',
  'No approval before purchase': 'No approval before purchase',
  'Signatory Contravention': 'Signatory Contravention',
  'Vendor AOR differs from actual vendor': 'Vendor AOR differs from actual vendor',
  'Manpower extension without PCPO approval': 'Manpower extension without PCPO approval',
  'Others': 'Others',
};

// Department mapping
const departmentMapping: Record<string, string> = {
  'People Team': 'People Team',
  'TEALS': 'TEALS',
  'FormSG': 'FormSG',
  'Marketing': 'Marketing',
  'Isomer': 'Isomer',
  'Armoury': 'Armoury',
  'Product Operations': 'Product Operations',
  'DGS': 'DGS',
  'Developer Relations': 'Developer Relations',
  'OGP': 'OGP',
  'BFG Lawify': 'BFG',
  'BFG Callbridge': 'BFG',
  'Personal': 'Personal',
};

interface ExcelRow {
  Type: string;
  'Resolved Period': string | Date;
  'Contravention Type': string;
  Vendor: string;
  'Value (S$)': number | string;
  'Submitted By': string;
  'Product/Function Team': string;
  Summary: string;
}

async function getOrCreateUser(name: string, departmentName: string): Promise<string> {
  if (!name || name === 'NaN' || name.trim() === '') {
    // Return admin user for unknown submitters
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    return admin!.id;
  }

  const cleanName = name.trim();
  const email = `${cleanName.toLowerCase().replace(/\s+/g, '.')}@ogp.gov.sg`;

  // Find or create department
  let departmentId: string | undefined;
  const mappedDeptName = departmentMapping[departmentName] || departmentName;

  if (mappedDeptName && mappedDeptName !== 'NaN') {
    const dept = await prisma.department.findFirst({
      where: { name: mappedDeptName },
    });
    departmentId = dept?.id;
  }

  // Find existing user
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { name: cleanName },
        { email },
      ],
    },
  });

  if (!user) {
    // Create new user
    const passwordHash = await bcrypt.hash('changeme123', 12);
    const employeeId = `EMP${Date.now().toString().slice(-6)}`;

    user = await prisma.user.create({
      data: {
        employeeId,
        email,
        passwordHash,
        name: cleanName,
        role: 'USER',
        departmentId,
      },
    });

    // Create points record
    await prisma.employeePoints.create({
      data: {
        employeeId: user.id,
        totalPoints: 0,
      },
    });

    console.log(`Created user: ${cleanName} (${email})`);
  }

  return user.id;
}

async function getContraventionType(typeName: string): Promise<{ id: string; name: string; defaultPoints: number } | null> {
  if (!typeName || typeName === 'NaN' || typeName.trim() === '') {
    // Return "Others" type for unknown
    const othersType = await prisma.contraventionType.findFirst({
      where: { name: 'Others' },
    });
    return othersType;
  }

  const mappedName = typeMapping[typeName.trim()] || typeName.trim();

  let type = await prisma.contraventionType.findFirst({
    where: { name: mappedName },
  });

  if (!type) {
    // Try to find by partial match
    type = await prisma.contraventionType.findFirst({
      where: {
        name: {
          contains: mappedName.split(' ')[0],
          mode: 'insensitive',
        },
      },
    });
  }

  if (!type) {
    // Return "Others" as fallback
    type = await prisma.contraventionType.findFirst({
      where: { name: 'Others' },
    });
  }

  return type;
}

function parseDate(dateValue: string | Date | null | undefined): Date {
  if (!dateValue || dateValue === 'NaT' || dateValue === 'NaN') {
    return new Date();
  }

  if (dateValue instanceof Date) {
    return dateValue;
  }

  // Handle Excel serial date numbers
  if (typeof dateValue === 'number') {
    return new Date((dateValue - 25569) * 86400 * 1000);
  }

  // Parse string date
  const parsed = new Date(dateValue);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '' || value === '??' || value === 'NaN') {
    return null;
  }

  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  return isNaN(num) ? null : num;
}

async function generateRefNo(year: number, index: number): Promise<string> {
  return `CONTRA-${year}-${(index + 1).toString().padStart(3, '0')}`;
}

async function migrate() {
  console.log('Starting Excel migration...');

  // Read Excel file - use absolute path to the parent folder
  const excelPath = '/Users/daniellow/Desktop/Contravention Tracker/Contraventions🔥.xlsx';
  console.log(`Reading from: ${excelPath}`);

  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: ExcelRow[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${data.length} rows to import`);

  // Get admin user for logging
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    throw new Error('Admin user not found. Please run seed first.');
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    try {
      // Get or create employee
      const employeeId = await getOrCreateUser(
        row['Submitted By'],
        row['Product/Function Team']
      );

      // Get contravention type
      const contraventionType = await getContraventionType(row['Contravention Type']);
      if (!contraventionType) {
        console.error(`Row ${i + 1}: Could not find contravention type: ${row['Contravention Type']}`);
        errorCount++;
        continue;
      }

      // Parse values
      const incidentDate = parseDate(row['Resolved Period']);
      const valueSgd = parseValue(row['Value (S$)']);
      const year = incidentDate.getFullYear();

      // Generate reference number
      const existingCount = await prisma.contravention.count({
        where: {
          referenceNo: {
            startsWith: `CONTRA-${year}-`,
          },
        },
      });
      const referenceNo = await generateRefNo(year, existingCount);

      // Determine description
      const description = row.Summary || row['Contravention Type'] || 'Imported from Excel';

      // Create contravention
      const contravention = await prisma.contravention.create({
        data: {
          referenceNo,
          employeeId,
          loggedById: admin.id,
          typeId: contraventionType.id,
          vendor: row.Vendor && row.Vendor !== 'NaN' ? row.Vendor : null,
          valueSgd: valueSgd,
          description: description,
          summary: row.Summary && row.Summary !== 'NaN' ? row.Summary : null,
          points: contraventionType.defaultPoints,
          status: 'RESOLVED' as ContraventionStatus,
          incidentDate,
          resolvedDate: incidentDate,
          acknowledgedAt: incidentDate,
          acknowledgedById: employeeId,
        },
      });

      // Update employee points
      const pointsRecord = await prisma.employeePoints.findUnique({
        where: { employeeId },
      });

      if (pointsRecord) {
        const newTotal = pointsRecord.totalPoints + contraventionType.defaultPoints;
        const history = (pointsRecord.pointsHistory as any[]) || [];
        history.push({
          date: incidentDate.toISOString(),
          points: contraventionType.defaultPoints,
          contraventionId: contravention.id,
          reason: `${referenceNo}: ${contraventionType.name || 'Contravention'}`,
          type: 'add',
        });

        // Determine escalation level
        let currentLevel: EscalationLevel | null = null;
        if (newTotal >= 12) currentLevel = 'LEVEL_5';
        else if (newTotal >= 8) currentLevel = 'LEVEL_4';
        else if (newTotal >= 5) currentLevel = 'LEVEL_3';
        else if (newTotal >= 3) currentLevel = 'LEVEL_2';
        else if (newTotal >= 1) currentLevel = 'LEVEL_1';

        await prisma.employeePoints.update({
          where: { employeeId },
          data: {
            totalPoints: newTotal,
            currentLevel,
            pointsHistory: history as any,
          },
        });
      }

      console.log(`Imported: ${referenceNo} - ${row['Submitted By'] || 'Unknown'} - ${contraventionType.name || 'Unknown Type'}`);
      successCount++;
    } catch (error) {
      console.error(`Error importing row ${i + 1}:`, error);
      errorCount++;
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`Successfully imported: ${successCount}`);
  console.log(`Errors: ${errorCount}`);

  // Print employee points summary
  console.log('\n=== Employee Points Summary ===');
  const employees = await prisma.user.findMany({
    where: { role: 'USER' },
    include: {
      pointsRecord: true,
      _count: { select: { contraventions: true } },
    },
    orderBy: { name: 'asc' },
  });

  for (const emp of employees) {
    if (emp._count.contraventions > 0) {
      console.log(
        `${emp.name}: ${emp.pointsRecord?.totalPoints || 0} points, ` +
        `${emp._count.contraventions} contraventions, ` +
        `Level: ${emp.pointsRecord?.currentLevel || 'None'}`
      );
    }
  }
}

migrate()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

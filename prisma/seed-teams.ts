import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

// Teams list from Excel file
const TEAMS = [
  'ActiveSG',
  'AI Aunty',
  'Armoury',
  'AskGov',
  'AttendPA',
  'Bright',
  'Build For Good',
  'BYOS',
  'CalSG',
  'Care360',
  'CareersGovSG',
  'CrackDown',
  'Culture stuff',
  'Design',
  'Developer Relations',
  'DGS',
  'DistributeSG',
  'ERP X',
  'Finance',
  'FindX',
  'FormSG',
  'Functional Management',
  'GoGov',
  'HAS',
  'Healthtech',
  'Highway',
  'International',
  'Isomer',
  'KampungSpirit',
  'Lens',
  'LetterSG',
  'Maps',
  'Marketing',
  'Metis',
  'MyClub',
  'Pair',
  'Parking.sg',
  'PaySG',
  'People Ops',
  'Plumber',
  'Policy & Transformation',
  'Postman / SGC / BTN',
  'Procurit',
  'Public Engagement',
  'Pulse',
  'Redeem',
  'Referral Exchange',
  'Roadbuster',
  'Rooster',
  'Scamshield',
  'Scribe',
  'Security',
  'SGID',
  'SGID Bridge',
  'Signify',
  'Social360',
  'Spaceship',
  'TEALS',
  'Tooling',
];

async function main() {
  console.log('Starting team seed...');

  // First, create the Personal team if it doesn't exist
  const personalTeam = await prisma.team.upsert({
    where: { name: 'Personal' },
    update: {},
    create: {
      name: 'Personal',
      description: 'For contraventions not associated with any team',
      isPersonal: true,
    },
  });
  console.log(`Personal team: ${personalTeam.id}`);

  // Now create all the teams from the list
  let created = 0;
  let existing = 0;

  for (const teamName of TEAMS) {
    try {
      await prisma.team.upsert({
        where: { name: teamName },
        update: {},  // Don't update if exists
        create: {
          name: teamName,
          isPersonal: false,
        },
      });
      created++;
    } catch (error) {
      // Team might already exist with slight name difference
      console.log(`Team "${teamName}" might already exist:`, error);
      existing++;
    }
  }

  console.log(`\nSeed complete!`);
  console.log(`- Created/verified: ${created} teams`);
  console.log(`- Skipped/existing: ${existing} teams`);
  console.log(`- Total teams in list: ${TEAMS.length}`);

  // Show all teams
  const allTeams = await prisma.team.findMany({
    orderBy: { name: 'asc' },
  });
  console.log(`\nTotal teams in database: ${allTeams.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

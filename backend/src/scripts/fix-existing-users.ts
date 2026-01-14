import prisma from '../config/database';

async function main() {
  // Count users with incomplete profiles
  const incompleteCount = await prisma.user.count({
    where: { isProfileComplete: false }
  });
  
  console.log(`Found ${incompleteCount} users with isProfileComplete = false`);
  
  // Update all existing users to have complete profiles
  const result = await prisma.user.updateMany({
    where: { isProfileComplete: false },
    data: { isProfileComplete: true }
  });
  
  console.log(`Updated ${result.count} users to isProfileComplete = true`);
  
  // Verify the admin user
  const adminUsers = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, email: true, name: true, role: true, isProfileComplete: true }
  });
  
  console.log('\nAdmin users after update:');
  adminUsers.forEach((u) => console.log(`  - ${u.email} (${u.name}): isProfileComplete=${u.isProfileComplete}, role=${u.role}`));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  // Get an admin user
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true, employeeId: true, email: true, name: true, role: true, departmentId: true }
  });

  if (!admin) {
    console.log('No admin user found');
    return;
  }

  // Create a test JWT token
  const payload = {
    userId: admin.id,
    employeeId: admin.employeeId,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    departmentId: admin.departmentId
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  console.log('Test JWT Token:');
  console.log(token);
}

main().finally(() => prisma.$disconnect());

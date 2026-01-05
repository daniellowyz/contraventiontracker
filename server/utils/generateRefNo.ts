import prisma from '../config/database';

/**
 * Generate a unique reference number for contraventions
 * Format: CONTRA-YYYY-NNN (e.g., CONTRA-2026-001)
 */
export async function generateReferenceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CONTRA-${year}-`;

  // Get the last contravention for this year
  const lastContravention = await prisma.contravention.findFirst({
    where: {
      referenceNo: {
        startsWith: prefix,
      },
    },
    orderBy: {
      referenceNo: 'desc',
    },
  });

  let nextNumber = 1;

  if (lastContravention) {
    const lastNumber = parseInt(lastContravention.referenceNo.split('-')[2], 10);
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
}

export default generateReferenceNumber;

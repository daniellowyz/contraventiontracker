import prisma from '../config/database';
import { JwtPayload, Role } from '../types';
import { AppError } from '../middleware/errorHandler';

export class AuthService {
  /**
   * Register a new user (admin only, OTP-based auth - no password needed)
   */
  async register(data: {
    email: string;
    name: string;
    employeeId: string;
    departmentId?: string;
    role?: Role;
  }): Promise<JwtPayload> {
    const normalizedEmail = data.email.toLowerCase().trim();

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { employeeId: data.employeeId },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        throw new AppError('Email already registered', 409);
      }
      throw new AppError('Employee ID already exists', 409);
    }

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: data.name,
        employeeId: data.employeeId,
        role: data.role || 'USER',
        ...(data.departmentId && {
          department: { connect: { id: data.departmentId } },
        }),
      },
    });

    // Create initial points record
    await prisma.employeePoints.create({
      data: {
        employeeId: user.id,
        totalPoints: 0,
      },
    });

    return {
      userId: user.id,
      employeeId: user.employeeId,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  /**
   * Get current user details
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: true,
        pointsRecord: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return {
      id: user.id,
      employeeId: user.employeeId,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      points: user.pointsRecord?.totalPoints || 0,
      currentLevel: user.pointsRecord?.currentLevel,
    };
  }
}

export default new AuthService();

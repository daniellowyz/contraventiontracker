import crypto from 'crypto';
import validator from 'validator';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import emailService from './email.service';

// Constants
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const ALLOWED_DOMAINS = ['@open.gov.sg', '@tech.gov.sg', '@ogp.gov.sg'];

export class OtpService {
  /**
   * Validate email format using validator library
   * and check for allowed domains
   */
  validateEmail(email: string): { isValid: boolean; error?: string } {
    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Use validator library to check if it's a valid email
    if (!validator.isEmail(normalizedEmail)) {
      return { isValid: false, error: 'Invalid email format' };
    }

    // Check if email ends with allowed domain
    const isAllowedDomain = ALLOWED_DOMAINS.some(domain =>
      normalizedEmail.endsWith(domain)
    );

    if (!isAllowedDomain) {
      return {
        isValid: false,
        error: `Email must end with ${ALLOWED_DOMAINS.join(' or ')}`
      };
    }

    return { isValid: true };
  }

  /**
   * Generate a cryptographically secure 6-digit OTP
   */
  generateOtp(): string {
    // Generate random bytes and convert to 6-digit number
    const randomBytes = crypto.randomBytes(4);
    const randomNum = randomBytes.readUInt32BE(0);
    // Ensure it's always 6 digits (100000-999999)
    const otp = (randomNum % 900000) + 100000;
    return otp.toString();
  }

  /**
   * Hash OTP with email as salt using SHA-256
   * Uses HMAC to combine OTP with email as key (salt)
   */
  hashOtp(otp: string, email: string): string {
    const normalizedEmail = email.toLowerCase().trim();
    const hmac = crypto.createHmac('sha256', normalizedEmail);
    hmac.update(otp);
    return hmac.digest('hex');
  }

  /**
   * Safely compare two hashes using timing-safe comparison
   * to prevent timing attacks
   */
  compareHashes(hash1: string, hash2: string): boolean {
    try {
      const buf1 = Buffer.from(hash1, 'hex');
      const buf2 = Buffer.from(hash2, 'hex');

      if (buf1.length !== buf2.length) {
        return false;
      }

      return crypto.timingSafeEqual(buf1, buf2);
    } catch {
      return false;
    }
  }

  /**
   * Request OTP for an email address
   * Creates OTP record and logs OTP to console (for development)
   */
  async requestOtp(email: string): Promise<{ success: boolean; message: string }> {
    // Validate email
    const validation = this.validateEmail(email);
    if (!validation.isValid) {
      throw new AppError(validation.error!, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find existing user (optional - for logging purposes)
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Invalidate any existing unused OTPs for this email
    await prisma.otpRecord.updateMany({
      where: {
        email: normalizedEmail,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        expiresAt: new Date(), // Expire immediately
      },
    });

    // Generate new OTP
    const otp = this.generateOtp();
    const otpHash = this.hashOtp(otp, normalizedEmail);

    // Calculate expiry time (15 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    // Store OTP record
    await prisma.otpRecord.create({
      data: {
        email: normalizedEmail,
        otpHash,
        expiresAt,
        userId: existingUser?.id,
      },
    });

    // Always log OTP to console for debugging/development
    console.log('========================================');
    console.log(`OTP for ${normalizedEmail}: ${otp}`);
    console.log(`Expires at: ${expiresAt.toISOString()}`);
    console.log('========================================');

    // Send OTP via email
    const emailResult = await emailService.sendOtpEmail({
      email: normalizedEmail,
      otp,
      expiresAt,
    });

    if (!emailResult.success) {
      console.error('[OTP] Failed to send OTP email:', emailResult.error);
      // Don't throw error - OTP is still valid and logged to console
      // This allows development to continue even if email fails
    } else {
      console.log(`[OTP] Email sent successfully to ${normalizedEmail}`);
    }

    return {
      success: true,
      message: 'OTP sent to your email address',
    };
  }

  /**
   * Verify OTP and return user info if valid
   */
  async verifyOtp(email: string, otp: string): Promise<{
    userId: string;
    employeeId: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'USER';
  }> {
    // Validate email format
    const validation = this.validateEmail(email);
    if (!validation.isValid) {
      throw new AppError(validation.error!, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedOtp = otp.trim();

    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(normalizedOtp)) {
      throw new AppError('Invalid OTP format. Must be 6 digits.', 400);
    }

    // Find the most recent valid OTP record for this email
    const otpRecord = await prisma.otpRecord.findFirst({
      where: {
        email: normalizedEmail,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new AppError('No valid OTP found. Please request a new one.', 400);
    }

    // Check if max attempts exceeded
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      // Invalidate this OTP
      await prisma.otpRecord.update({
        where: { id: otpRecord.id },
        data: { expiresAt: new Date() },
      });
      throw new AppError('Maximum attempts exceeded. Please request a new OTP.', 400);
    }

    // Hash the provided OTP with email as salt
    const providedHash = this.hashOtp(normalizedOtp, normalizedEmail);

    // Use timing-safe comparison
    const isValid = this.compareHashes(providedHash, otpRecord.otpHash);

    if (!isValid) {
      // Increment attempts counter
      await prisma.otpRecord.update({
        where: { id: otpRecord.id },
        data: { attempts: otpRecord.attempts + 1 },
      });

      const remainingAttempts = MAX_ATTEMPTS - otpRecord.attempts - 1;
      throw new AppError(
        `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`,
        400
      );
    }

    // OTP is valid - mark as used
    await prisma.otpRecord.update({
      where: { id: otpRecord.id },
      data: { usedAt: new Date() },
    });

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Auto-create user for allowed domains
      // Generate unique employee ID
      const count = await prisma.user.count();
      const employeeId = `EMP${String(count + 1).padStart(4, '0')}`;

      // Extract name from email (before @)
      const namePart = normalizedEmail.split('@')[0];
      const name = namePart
        .split(/[._-]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          employeeId,
          name,
          role: 'USER',
          isActive: true,
        },
      });

      // Create initial points record
      await prisma.employeePoints.create({
        data: {
          employeeId: user.id,
          totalPoints: 0,
        },
      });
    }

    // Check if user is active
    if (!user.isActive) {
      throw new AppError('Account is deactivated', 401);
    }

    return {
      userId: user.id,
      employeeId: user.employeeId,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  /**
   * Clean up expired OTP records (can be called periodically)
   */
  async cleanupExpiredOtps(): Promise<number> {
    const result = await prisma.otpRecord.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { usedAt: { not: null } },
        ],
      },
    });
    return result.count;
  }
}

export default new OtpService();

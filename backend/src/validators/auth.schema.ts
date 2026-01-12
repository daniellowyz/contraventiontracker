import { z } from 'zod';

// Allowed email domains
const ALLOWED_DOMAINS = ['@open.gov.sg', '@tech.gov.sg'];

// Custom email validator that checks for allowed domains
const allowedDomainEmail = z.string()
  .email('Invalid email address')
  .refine(
    (email) => ALLOWED_DOMAINS.some(domain => email.toLowerCase().endsWith(domain)),
    { message: `Email must end with ${ALLOWED_DOMAINS.join(' or ')}` }
  );

// OTP Request Schema - Step 1: User enters email
export const requestOtpSchema = z.object({
  email: allowedDomainEmail,
});

// OTP Verify Schema - Step 2: User enters OTP
export const verifyOtpSchema = z.object({
  email: allowedDomainEmail,
  otp: z.string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),
});

// Legacy login schema (kept for backward compatibility during migration)
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: allowedDomainEmail,
  name: z.string().min(2, 'Name must be at least 2 characters'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  departmentId: z.string().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

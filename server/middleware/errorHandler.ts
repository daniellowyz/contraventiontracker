import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error name:', err.name);
  console.error('Error message:', err.message);
  console.error('Error stack:', err.stack);

  // Zod validation errors
  if (err instanceof ZodError) {
    console.error('Zod validation error:', JSON.stringify(err.issues));
    res.status(400).json({
      success: false,
      error: 'Validation error',
      errorType: 'ZodError',
      details: err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error('Prisma known error:', err.code, err.message);
    switch (err.code) {
      case 'P2002':
        res.status(409).json({
          success: false,
          error: 'A record with this value already exists',
          errorType: 'PrismaUniqueConstraint',
        });
        return;
      case 'P2025':
        res.status(404).json({
          success: false,
          error: 'Record not found',
          errorType: 'PrismaNotFound',
        });
        return;
      default:
        res.status(400).json({
          success: false,
          error: 'Database error',
          errorType: 'PrismaKnownError',
          code: err.code,
        });
        return;
    }
  }

  // Prisma client initialization/validation errors
  if (err.name === 'PrismaClientInitializationError' ||
      err.name === 'PrismaClientValidationError' ||
      err.name === 'PrismaClientUnknownRequestError') {
    console.error('Prisma client error:', err.name, err.message);
    res.status(500).json({
      success: false,
      error: 'Database connection error',
      errorType: err.name,
      details: err.message,
    });
    return;
  }

  // Custom AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      errorType: 'AppError',
    });
    return;
  }

  // Default error
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
    errorType: err.name || 'UnknownError',
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
}

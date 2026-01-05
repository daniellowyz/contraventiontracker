import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AuthenticatedRequest } from '../types';

export async function logAudit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  oldValues: unknown,
  newValues: unknown,
  req: AuthenticatedRequest
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : null,
        newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : null,
        ipAddress: req.ip || req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

// Middleware to automatically log certain actions
export function auditMiddleware(action: string, entityType: string) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      // Log after response is sent
      setImmediate(async () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const entityId = req.params.id || (body as { data?: { id?: string } })?.data?.id || null;
            await logAudit(
              req.user?.userId || null,
              action,
              entityType,
              entityId,
              null,
              req.body,
              req
            );
          }
        } catch (error) {
          console.error('Audit middleware error:', error);
        }
      });

      return originalJson(body);
    };

    next();
  };
}

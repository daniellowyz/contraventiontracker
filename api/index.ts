import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app';

// Force Node.js runtime (not edge) to allow process.env access
export const config = {
  runtime: 'nodejs20.x',
};

// Export handler for Vercel serverless
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}

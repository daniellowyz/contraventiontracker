import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app';

// Export handler for Vercel serverless (Node.js runtime is default)
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}

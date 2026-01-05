import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../server/app';

// Single serverless function entry point
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}

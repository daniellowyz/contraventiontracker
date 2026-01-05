import dotenv from 'dotenv';

dotenv.config();

const portStr = process.env.PORT || '3001';
const smtpPortStr = process.env.SMTP_PORT || '587';

export const config = {
  // Server
  port: Number(portStr),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || '*',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  // Email
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(smtpPortStr),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'noreply@example.com',
  },

  // Slack
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
};

export default config;

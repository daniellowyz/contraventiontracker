// Environment configuration for Vercel serverless
// Values are read at runtime, not build time

function getEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config = {
  // Server
  port: getEnvNumber('PORT', 3001),
  nodeEnv: getEnv('NODE_ENV', 'production'),
  frontendUrl: getEnv('FRONTEND_URL', '*'),

  // Database
  databaseUrl: getEnv('DATABASE_URL'),

  // Supabase
  supabaseUrl: getEnv('SUPABASE_URL'),
  supabaseAnonKey: getEnv('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),

  // JWT
  jwtSecret: getEnv('JWT_SECRET', 'default-secret-change-in-production'),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '24h'),

  // Email
  smtp: {
    host: getEnv('SMTP_HOST'),
    port: getEnvNumber('SMTP_PORT', 587),
    user: getEnv('SMTP_USER'),
    pass: getEnv('SMTP_PASS'),
    from: getEnv('EMAIL_FROM', 'noreply@example.com'),
  },

  // Slack
  slackWebhookUrl: getEnv('SLACK_WEBHOOK_URL'),
};

export default config;

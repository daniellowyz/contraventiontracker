export const config = {
  port: 3001,
  nodeEnv: 'production',
  frontendUrl: '*',
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: '24h',
  smtp: {
    host: '',
    port: 587,
    user: '',
    pass: '',
    from: 'noreply@example.com',
  },
  slackWebhookUrl: '',
};

export default config;

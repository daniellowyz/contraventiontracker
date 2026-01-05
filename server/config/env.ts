// Environment configuration for Vercel serverless
// Use getter functions to defer process.env access to runtime

export const config = {
  get databaseUrl() {
    return process.env.DATABASE_URL;
  },
  get supabaseUrl() {
    return process.env.SUPABASE_URL;
  },
  get supabaseAnonKey() {
    return process.env.SUPABASE_ANON_KEY;
  },
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  },
  get jwtSecret() {
    return process.env.JWT_SECRET;
  },
  jwtExpiresIn: '24h',
};

export default config;

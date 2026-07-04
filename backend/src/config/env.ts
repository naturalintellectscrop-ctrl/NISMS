import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  databaseUrl: required('DATABASE_URL', 'postgresql://nisms:nisms@localhost:5432/nisms?schema=public'),
  jwtSecret: required('JWT_SECRET', 'dev-only-secret-change-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  isProduction: process.env.NODE_ENV === 'production',
};

if (env.isProduction && env.jwtSecret === 'dev-only-secret-change-in-production') {
  throw new Error('JWT_SECRET must be set in production');
}

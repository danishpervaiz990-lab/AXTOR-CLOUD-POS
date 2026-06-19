import dotenv from 'dotenv';

dotenv.config();

type NodeEnv = 'development' | 'test' | 'production';

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid number environment variable: ${name}`);
  }
  return parsed;
}

function parseCorsOrigins(value: string): string[] | '*' {
  const cleaned = value.trim();
  if (!cleaned || cleaned === '*') return '*';
  return cleaned.split(',').map(origin => origin.trim()).filter(Boolean);
}

const nodeEnv = optional('NODE_ENV', 'development') as NodeEnv;

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: numberEnv('PORT', 4000),
  appName: optional('APP_NAME', 'Axtor POS Cloud API'),
  apiPrefix: optional('API_PREFIX', '/api/v1'),
  databaseUrl: required('DATABASE_URL'),
  corsOrigins: parseCorsOrigins(optional('CORS_ORIGIN', 'http://localhost:3000,http://localhost:5173,https://axtorpos.vercel.app')),
  authTokenSecret: required('AUTH_TOKEN_SECRET'),
  authTokenExpiresSeconds: numberEnv('AUTH_TOKEN_EXPIRES_SECONDS', 86400)
};

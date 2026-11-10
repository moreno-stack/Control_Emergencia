export interface Env {
  PORT: string;
  CORS_ORIGINS: string;
  TIMEZONE: string;
  POSTGRES_HOST: string;
  POSTGRES_PORT: string;
  POSTGRES_DB: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  ADMIN_NAME: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  DB_DROP_SCHEMA?: string;
}

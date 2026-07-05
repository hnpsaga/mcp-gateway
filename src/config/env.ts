import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),

  // Logging and Observability configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  LOG_STRUCTURED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  METRICS_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  OTEL_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Transport configuration
  TRANSPORT_LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRANSPORT_MAX_MESSAGE_SIZE: z.coerce.number().int().positive().default(1048576), // 1MB
  TRANSPORT_STDOUT_BUFFER_SIZE: z.coerce.number().int().positive().default(10485760), // 10MB
  TRANSPORT_STDERR_BUFFER_SIZE: z.coerce.number().int().positive().default(1048576), // 1MB
  TRANSPORT_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().positive().default(100),
  TRANSPORT_PROCESS_STARTUP_TIMEOUT: z.coerce.number().int().positive().default(15000), // 15s
  TRANSPORT_INITIALIZE_TIMEOUT: z.coerce.number().int().positive().default(15000), // 15s
  TRANSPORT_CONNECTION_TIMEOUT: z.coerce.number().int().positive().default(30000), // 30s
  TRANSPORT_DISCONNECT_TIMEOUT: z.coerce.number().int().positive().default(5000), // 5s

  // Database configuration
  DATABASE_PATH: z.string().default('./data'),
  DATABASE_FILENAME: z.string().default('mcp-gateway.db'),
  DATABASE_WAL_MODE: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  DATABASE_BUSY_TIMEOUT: z.coerce.number().int().positive().default(5000),

  // Authentication configuration
  AUTH_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  API_KEYS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  AUTH_HEADER_NAME: z.string().default('x-api-key'),
  AUTH_BEARER_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  AUTH_SWAGGER_AUTHENTICATE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = configSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  LOG_LEVEL: process.env.LOG_LEVEL,
  LOG_PRETTY: process.env.LOG_PRETTY,
  LOG_STRUCTURED: process.env.LOG_STRUCTURED,
  METRICS_ENABLED: process.env.METRICS_ENABLED,
  OTEL_ENABLED: process.env.OTEL_ENABLED,
  DATABASE_PATH: process.env.DATABASE_PATH,
  DATABASE_FILENAME: process.env.DATABASE_FILENAME,
  DATABASE_WAL_MODE: process.env.DATABASE_WAL_MODE,
  DATABASE_BUSY_TIMEOUT: process.env.DATABASE_BUSY_TIMEOUT,

  AUTH_ENABLED: process.env.AUTH_ENABLED,
  API_KEYS: process.env.API_KEYS,
  AUTH_HEADER_NAME: process.env.AUTH_HEADER_NAME,
  AUTH_BEARER_ENABLED: process.env.AUTH_BEARER_ENABLED,
  AUTH_SWAGGER_AUTHENTICATE: process.env.AUTH_SWAGGER_AUTHENTICATE,
});

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  const formatted = parsed.error.format();
  for (const [key, value] of Object.entries(formatted)) {
    if (key === '_errors') continue;
    const issues = value as { _errors: string[] };
    if (issues._errors?.length) {
      for (const message of issues._errors) {
        console.error(`  - ${key}: ${message}`);
      }
    }
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof configSchema>;

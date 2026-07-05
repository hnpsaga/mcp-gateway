import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),

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
});

const parsed = configSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  DATABASE_PATH: process.env.DATABASE_PATH,
  DATABASE_FILENAME: process.env.DATABASE_FILENAME,
  DATABASE_WAL_MODE: process.env.DATABASE_WAL_MODE,
  DATABASE_BUSY_TIMEOUT: process.env.DATABASE_BUSY_TIMEOUT,
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

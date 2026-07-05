import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
});

const parsed = configSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  HOST: process.env.HOST,
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

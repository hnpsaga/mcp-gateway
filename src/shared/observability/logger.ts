import pino from 'pino';

import { config } from '../../config/index.js';
import { telemetryContextStorage } from './context.js';

const isPretty = config.LOG_PRETTY;
const level = config.LOG_LEVEL;

export const logger = pino({
  level,
  // If pretty logging is enabled, we use pino-pretty
  transport: isPretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function getLogger(): pino.Logger {
  const store = telemetryContextStorage.getStore();
  return (store?.logger ?? logger) as pino.Logger;
}

export function sanitize(val: unknown): unknown {
  if (val === null || val === undefined) {
    return val;
  }
  if (typeof val === 'string') {
    const lowerVal = val.toLowerCase();
    if (
      lowerVal.startsWith('bearer ') ||
      lowerVal.includes('key') ||
      lowerVal.includes('secret') ||
      lowerVal.includes('token') ||
      lowerVal.includes('password') ||
      val.length > 200
    ) {
      return '[REDACTED]';
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sanitize);
  }
  if (typeof val === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const lowerK = k.toLowerCase();
      if (
        lowerK.includes('key') ||
        lowerK.includes('secret') ||
        lowerK.includes('token') ||
        lowerK.includes('password') ||
        lowerK.includes('auth') ||
        lowerK.includes('credential') ||
        lowerK.includes('private')
      ) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = sanitize(v);
      }
    }
    return sanitized;
  }
  return val;
}

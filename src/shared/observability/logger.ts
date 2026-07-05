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
  return store?.logger ?? logger;
}

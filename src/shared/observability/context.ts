import { AsyncLocalStorage } from 'node:async_hooks';

import type { FastifyBaseLogger } from 'fastify';
import type pino from 'pino';

export interface TelemetryContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  logger?: FastifyBaseLogger | pino.Logger;
}

export const telemetryContextStorage = new AsyncLocalStorage<TelemetryContext>();

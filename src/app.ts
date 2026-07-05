import { randomUUID } from 'node:crypto';

import fastify, { FastifyInstance } from 'fastify';

import { healthRoutes } from './routes/health.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: true,

    // Explicit request ID configuration for structured logging, tracing, and metrics
    requestIdHeader: 'request-id',
    genReqId: () => randomUUID(),
  });

  // Global Error Handler
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    app.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
    });
  });

  // Register routes
  await app.register(healthRoutes);

  return app;
}

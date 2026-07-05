import fastify, { FastifyInstance } from 'fastify';

import { healthRoutes } from './routes/health.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: true,
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

import fastify, { FastifyInstance } from 'fastify';

import { healthRoutes } from './routes/health.js';
import { AppError } from './shared/errors/app-error.js';
import type { ErrorResponse } from './shared/response/error-response.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: true,
    requestIdHeader: 'request-id',
  });

  app.setErrorHandler((error: Error, request, reply) => {
    app.log.error(error);

    if (error instanceof AppError) {
      const body: ErrorResponse = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
      return reply.status(error.statusCode).send(body);
    }

    const body: ErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
    return reply.status(500).send(body);
  });

  await app.register(healthRoutes);

  return app;
}

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../../shared/errors/app-error.js';
import type { ErrorResponse } from '../../shared/response/error-response.js';
import { createErrorResponse } from './response.js';

export function ApiError(error: Error, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  if (error instanceof AppError) {
    const body: ErrorResponse = createErrorResponse(error.code, error.message, error.details);
    return reply.status(error.statusCode).send(body);
  }

  const fastifyError = error as FastifyError & {
    validation?: Array<{ message: string; instancePath: string }>;
  };

  if (fastifyError.validation) {
    const details = fastifyError.validation.map((v) => ({
      path: v.instancePath,
      message: v.message,
    }));
    const body: ErrorResponse = createErrorResponse(
      'VALIDATION_ERROR',
      'Request validation failed',
      details,
    );
    return reply.status(400).send(body);
  }

  if (fastifyError.statusCode && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
    const body: ErrorResponse = createErrorResponse('REQUEST_ERROR', fastifyError.message);
    return reply.status(fastifyError.statusCode).send(body);
  }

  const body: ErrorResponse = createErrorResponse('INTERNAL_ERROR', 'An unexpected error occurred');
  return reply.status(500).send(body);
}

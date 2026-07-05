import type { FastifyInstance } from 'fastify';

export async function executionRoutes(fastify: FastifyInstance) {
  fastify.log.info('Execution routes registered');
}

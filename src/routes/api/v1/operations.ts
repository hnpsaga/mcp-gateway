import type { FastifyInstance } from 'fastify';

export async function operationsRoutes(fastify: FastifyInstance) {
  fastify.log.info('Operations routes registered');
}

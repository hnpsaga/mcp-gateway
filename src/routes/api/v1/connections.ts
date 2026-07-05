import type { FastifyInstance } from 'fastify';

export async function connectionRoutes(fastify: FastifyInstance) {
  fastify.log.info('Connection routes registered');
}
